import { describe, expect, it } from 'vitest';
import { FISHING, SPOT_IDS } from '../../src/content/fishing';
import { fishShadows } from '../../src/core';
import { shadowAt } from '../../src/core/fishing/shadows';
import {
  aimAtPoint,
  castPreview,
  flightPoint,
  landingShare,
  planePoint,
  shadowPoint,
  showsShadows,
  WATER_VIEW,
  waterPoint,
} from '../../src/view/art/water-view';
import { precisePower } from '../../src/minigames/angling';

const V = WATER_VIEW;
const PRECISE = FISHING.cast.precisionPower;

it('lands farther with more power or depth, always on the water', () => {
  expect(landingShare(50, 80)).toBeGreaterThan(landingShare(50, 30));
  expect(landingShare(80, 50)).toBeGreaterThan(landingShare(30, 50));
  expect(landingShare(0, 0)).toBe(V.reach.near);
  expect(landingShare(100, 100)).toBe(V.reach.far);
  for (const direction of [-45, 0, 45])
    for (const share of [V.reach.near, V.reach.far]) {
      const { y } = waterPoint(direction, share);
      expect(y).toBeGreaterThan(V.horizonY);
      expect(y).toBeLessThan(V.nearY);
    }
});

it('shrinks toward the horizon and mirrors left and right', () => {
  expect(waterPoint(0, 0.8).scale).toBeLessThan(waterPoint(0, 0.2).scale);
  const left = waterPoint(-30, 0.5);
  const right = waterPoint(30, 0.5);
  expect(left.x + right.x).toBeCloseTo(2 * V.centerX);
});

it('turns a tap on the water into the aim whose preview lands there', () => {
  const { maxDirection } = FISHING.input;
  for (const power of [30, 50, 80])
    for (const direction of [-maxDirection, -20, 0, 25, maxDirection])
      for (const depth of [10, 40, 70]) {
        const { x, y } = waterPoint(direction, landingShare(depth, power));
        const aim = aimAtPoint(x, y, power)!;
        expect(aim.direction).toBe(direction);
        // The depth slider moves in steps of 5.
        expect(Math.abs(aim.depth - depth)).toBeLessThanOrEqual(5);
        const shown = waterPoint(aim.direction, landingShare(aim.depth, power));
        expect(Math.abs(shown.y - y)).toBeLessThan(12);
      }
  expect(aimAtPoint(V.centerX, V.horizonY - 10, 50)).toBeNull();
  expect(aimAtPoint(V.centerX, V.nearY + 10, 50)).toBeNull();
});

it('puts the square fight plane over open water', () => {
  const { left, top, side } = V.plane;
  const corners = [
    [left, top],
    [left + side, top],
    [left, top + side],
    [left + side, top + side],
  ].map(([x, y]) => [x! * V.size, y! * V.size] as const);
  for (const [x, y] of corners) {
    expect(y).toBeGreaterThanOrEqual(V.horizonY);
    expect(y).toBeLessThanOrEqual(V.nearY);
    const share = (V.nearY - y) / (V.nearY - V.horizonY);
    const half = V.nearHalf + (V.horizonHalf - V.nearHalf) * share;
    expect(Math.abs(x - V.centerX)).toBeLessThanOrEqual(half);
  }
});

it('draws each fish shadow where a cast that meets it head-on lands', () => {
  for (let hour = 0; hour < 20; hour++)
    for (const spotId of SPOT_IDS)
      for (const shadow of fishShadows({ seed: 9, minute: hour * 60 }, spotId))
        for (const power of [30, 60, 90]) {
          const aimDepth = 2 * shadow.reach - power;
          if (aimDepth < 0 || aimDepth > FISHING.input.maxDepth) continue;
          const cast = { direction: shadow.direction, aimDepth, power };
          expect(shadowAt([shadow], cast)).toBe(shadow);
          const drawn = shadowPoint(shadow.direction, shadow.reach);
          const landing = waterPoint(
            shadow.direction,
            landingShare(aimDepth, power),
          );
          expect(drawn.x).toBeCloseTo(landing.x);
          expect(drawn.y).toBeCloseTo(landing.y);
          expect(drawn.y).toBeGreaterThan(V.horizonY);
          expect(drawn.y).toBeLessThan(V.nearY);
        }
});

it('keeps the fish shadows in the water until a fish is hooked', () => {
  expect(showsShadows(null)).toBe(true);
  for (const phase of ['charge', 'waiting', 'hook'] as const)
    expect(showsShadows({ phase })).toBe(true);
  // The fight shows the hooked fish instead.
  expect(showsShadows({ phase: 'fight' })).toBe(false);
});

it('puts a fight-plane point on the canvas where the overlay ring is drawn', () => {
  const { left, top, side } = V.plane;
  expect(planePoint({ x: 0, y: 0 })).toMatchObject({
    x: left * V.size,
    y: top * V.size,
  });
  expect(planePoint({ x: 100, y: 100 })).toMatchObject({
    x: (left + side) * V.size,
    y: (top + side) * V.size,
  });
  // Same perspective as a landing at that height: smaller toward the horizon.
  const centre = planePoint(FISHING.motion.planeCentre);
  const share = (V.nearY - centre.y) / (V.nearY - V.horizonY);
  expect(centre.scale).toBeCloseTo(waterPoint(0, share).scale);
  expect(planePoint({ x: 50, y: 10 }).scale).toBeLessThan(centre.scale);
});

describe('the landing preview while aiming (spec 033 F5)', () => {
  /** A rod tip over the water, as the river art has it. */
  const TIP = { x: 372, y: 330 };
  const preview = (direction: number, depth: number, power: number) =>
    castPreview(direction, depth, power, TIP);
  const on = (point: { x: number; y: number }) => ({
    x: expect.closeTo(point.x, 6),
    y: expect.closeTo(point.y, 6),
  });

  it('rings the point the cast lands on, farther with power and mirrored by aim', () => {
    for (const [direction, depth, power] of [
      [-45, 0, 0],
      [-20, 50, 50],
      [0, 30, 70],
      [35, 100, 100],
    ] as const)
      expect(preview(direction, depth, power).landing).toEqual(
        waterPoint(direction, landingShare(depth, power)),
      );
    expect(preview(0, 50, 80).landing.y).toBeLessThan(
      preview(0, 50, 30).landing.y,
    );
    const left = preview(-30, 50, 60).landing;
    const right = preview(30, 50, 60).landing;
    expect(left.x + right.x).toBeCloseTo(2 * V.centerX);
    expect(left.y).toBeCloseTo(right.y);
  });

  it('puts the ring on a fish shadow for a cast Core finds on it', () => {
    let checked = 0;
    for (const shadow of fishShadows({ seed: 3, minute: 0 }, 'MOON'))
      for (const power of [40, 70]) {
        const aimDepth = 2 * shadow.reach - power;
        if (aimDepth < 0 || aimDepth > FISHING.input.maxDepth) continue;
        const cast = { direction: shadow.direction, aimDepth, power };
        expect(shadowAt([shadow], cast)).toBe(shadow);
        expect(
          preview(shadow.direction, aimDepth, power).landing,
        ).toMatchObject(on(shadowPoint(shadow.direction, shadow.reach)));
        checked++;
      }
    expect(checked).toBeGreaterThan(0);
  });

  it('flies the float from the rod tip in an arc onto the landing', () => {
    const landing = { x: 200, y: 400 };
    expect(flightPoint(TIP, landing, 0)).toEqual(TIP);
    expect(flightPoint(TIP, landing, 1)).toEqual(on(landing));
    // Midway it rises above the straight line by the lift.
    expect(flightPoint(TIP, landing, 0.5)).toEqual(
      on({ x: 286, y: 365 - V.flight.lift }),
    );
  });

  it('previews exactly the flight the float will take, dashed, from the tip onto the ring', () => {
    for (const direction of [-45, 0, 45])
      for (const power of [0, 50, 100]) {
        const { arc, landing } = preview(direction, 50, power);
        expect(arc[0]).toEqual(TIP);
        expect(arc.at(-1)).toEqual(on(landing));
        // Dash, gap, …, dash: an even number of points, so the last dash ends on the ring.
        expect(arc).toHaveLength(2 * V.flight.dashes);
        arc.forEach((point, i) =>
          expect(point).toEqual(
            flightPoint(TIP, landing, i / (arc.length - 1)),
          ),
        );
        for (const point of arc) {
          expect(point.y).toBeGreaterThan(V.horizonY);
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(V.size);
        }
      }
    // It follows the aim sideways and reaches farther with power.
    expect(preview(-30, 50, 60).arc[12]!.x).toBeLessThan(
      preview(30, 50, 60).arc[12]!.x,
    );
    expect(preview(0, 50, 90).arc.at(-1)!.y).toBeLessThan(
      preview(0, 50, 20).arc.at(-1)!.y,
    );
  });

  it('lays a rounded green zone, wider than the ring, where precise power lands', () => {
    const { maxDirection, maxDepth, maxPower } = FISHING.input;
    for (const direction of [-maxDirection, -20, 0, maxDirection])
      for (const depth of [0, 40, maxDepth]) {
        const at = (power: number) =>
          waterPoint(direction, landingShare(depth, power));
        const { zone } = preview(direction, depth, 50);
        expect(zone.low).toEqual(at(PRECISE.min));
        expect(zone.high).toEqual(at(PRECISE.max));
        // Across each end it is wider than the ring there, and it rounds off past it.
        const xs = zone.outline.map((point) => point.x);
        const ys = zone.outline.map((point) => point.y);
        for (const end of [zone.low, zone.high]) {
          const across = zone.outline
            .filter((point) => Math.abs(point.y - end.y) < 1e-9)
            .map((point) => point.x);
          expect(Math.max(...across) - Math.min(...across)).toBeGreaterThan(
            V.ring.width * end.scale,
          );
        }
        expect(Math.max(...ys)).toBeGreaterThan(zone.low.y);
        expect(Math.min(...ys)).toBeLessThan(zone.high.y);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...xs)).toBeLessThanOrEqual(V.size);
        for (let power = 0; power <= maxPower; power++) {
          const { landing, precise } = preview(direction, depth, power);
          // Precise casts land on it, others do not.
          const onGreen =
            landing.y <= zone.low.y + 1e-9 && landing.y >= zone.high.y - 1e-9;
          expect(onGreen).toBe(power >= PRECISE.min && power <= PRECISE.max);
          // The ring turns green exactly when Core would count the cast precise.
          expect(precise).toBe(precisePower(power));
          expect(precise).toBe(onGreen);
        }
      }
  });
});
