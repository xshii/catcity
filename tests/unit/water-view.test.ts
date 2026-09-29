import { describe, expect, it } from 'vitest';
import { FISHING, SPOT_IDS } from '../../src/content/fishing';
import { fishShadows } from '../../src/core';
import { shadowAt } from '../../src/core/fishing/shadows';
import {
  aimAtPoint,
  castPreview,
  flightPoint,
  hookedFish,
  landingShare,
  planePoint,
  shadowPoint,
  showsShadows,
  WATER_VIEW,
  waterPoint,
} from '../../src/view/art/water-view';

const V = WATER_VIEW;

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

describe('the hooked fish of a button fight (spec 033 F1)', () => {
  const tick = 7;
  it('sways below the float and, as the fight fills, grows and comes toward the dock', () => {
    for (const share of [V.reach.near, 0.5, V.reach.far]) {
      const landing = waterPoint(20, share);
      const start = hookedFish(landing, 0, tick);
      expect(start).toMatchObject({ scale: landing.scale, near: 0 });
      expect(start.y).toBeCloseTo(landing.y + V.hooked.below * landing.scale);
      let last = start;
      for (let progress = 10; progress <= 100; progress += 10) {
        const fish = hookedFish(landing, progress, tick);
        expect(fish.x).toBe(start.x);
        expect(fish.y).toBeGreaterThanOrEqual(last.y);
        expect(fish.scale).toBeGreaterThan(last.scale);
        expect(fish.near).toBeCloseTo(progress / 100);
        last = fish;
      }
      // At the end it has come part of the way, and stays on the water.
      expect(last.scale).toBeCloseTo(2 * landing.scale);
      expect(last.y).toBeLessThan(V.nearY);
      if (start.y < V.nearY)
        expect(last.y).toBeCloseTo(
          start.y + (V.nearY - start.y) * V.hooked.approach,
        );
    }
  });

  it('keeps out-of-range progress within the fight', () => {
    const landing = waterPoint(0, 0.5);
    expect(hookedFish(landing, -20, tick)).toEqual(
      hookedFish(landing, 0, tick),
    );
    expect(hookedFish(landing, 140, tick)).toEqual(
      hookedFish(landing, 100, tick),
    );
  });

  it('sways side to side with the fight tick only', () => {
    const landing = waterPoint(0, 0.5);
    const xs = [0, 8, 16, 24].map((t) => hookedFish(landing, 50, t).x);
    expect(new Set(xs).size).toBe(xs.length);
    for (const x of xs)
      expect(
        Math.abs(x - (landing.x - V.hooked.behind * landing.scale)),
      ).toBeLessThanOrEqual(V.hooked.sway);
  });
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

describe('the landing preview while aiming (spec 033 F5, F5b)', () => {
  /** A rod tip over the water, as the river art has it. */
  const TIP = { x: 372, y: 330 };
  const WORLD = { seed: 3, minute: 0 };
  const preview = (direction: number, aimDepth: number, power: number) =>
    castPreview(WORLD, 'MOON', { direction, aimDepth, power }, TIP);
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

  it('turns the ring green on a fish shadow exactly where Core finds the cast on one', () => {
    const shadows = fishShadows(WORLD, 'MOON');
    let checked = 0;
    for (const shadow of shadows)
      for (const power of [40, 70]) {
        const aimDepth = 2 * shadow.reach - power;
        if (aimDepth < 0 || aimDepth > FISHING.input.maxDepth) continue;
        // Head-on: the ring sits on the drawn shadow, and Core meets that shadow.
        const aimed = preview(shadow.direction, aimDepth, power);
        expect(aimed.landing).toMatchObject(
          on(shadowPoint(shadow.direction, shadow.reach)),
        );
        expect(aimed.shadow).toEqual(shadow);
        checked++;
      }
    expect(checked).toBeGreaterThan(0);
    // Everywhere else the preview answers as the cast would: green on one, cream off.
    const seen = new Set<boolean>();
    const { maxDirection, maxDepth, maxPower } = FISHING.input;
    for (
      let direction = -maxDirection;
      direction <= maxDirection;
      direction += 5
    )
      for (let aimDepth = 0; aimDepth <= maxDepth; aimDepth += 10)
        for (let power = 0; power <= maxPower; power += 10) {
          const cast = { direction, aimDepth, power };
          const { shadow } = preview(direction, aimDepth, power);
          expect(shadow).toEqual(shadowAt(shadows, cast));
          seen.add(shadow !== null);
        }
    expect(seen).toEqual(new Set([true, false]));
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
});
