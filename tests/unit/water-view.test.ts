import { describe, expect, it } from 'vitest';
import { FISHING, SPOT_IDS } from '../../src/content/fishing';
import { fishShadows } from '../../src/core';
import { shadowAt } from '../../src/core/fishing/shadows';
import {
  aimAtPoint,
  castPreview,
  landingShare,
  shadowPoint,
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

describe('the landing preview while aiming (spec 033 F5)', () => {
  const ROD = { x: 430, y: V.size };
  const preview = (direction: number, depth: number, power: number) =>
    castPreview(direction, depth, power, ROD);
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

  it('draws a dashed flight from the rod that arcs above the water onto the ring', () => {
    for (const direction of [-45, 0, 45])
      for (const power of [0, 50, 100]) {
        const { arc, landing } = preview(direction, 50, power);
        expect(arc[0]).toEqual(on(ROD));
        expect(arc.at(-1)).toEqual(on(landing));
        // Dash, gap, …, dash: an even number of points, so the last dash ends on the ring.
        expect(arc).toHaveLength(2 * V.arc.dashes);
        // It rises above the ring before coming down onto it, within the canvas.
        expect(Math.min(...arc.map((point) => point.y))).toBeLessThan(
          landing.y - 20,
        );
        for (const point of arc) {
          expect(point.y).toBeGreaterThan(V.horizonY);
          expect(point.y).toBeLessThanOrEqual(V.size);
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(V.size);
        }
      }
    // More power flies farther up the water, and the flight follows the aim sideways.
    expect(preview(0, 50, 90).arc.at(-1)!.y).toBeLessThan(
      preview(0, 50, 20).arc.at(-1)!.y,
    );
    expect(preview(-30, 50, 60).arc[10]!.x).toBeLessThan(
      preview(30, 50, 60).arc[10]!.x,
    );
  });

  it('marks green the water where precise power lands, and says when the ring is on it', () => {
    const { maxDirection, maxDepth, maxPower } = FISHING.input;
    for (const direction of [-maxDirection, -20, 0, maxDirection])
      for (const depth of [0, 40, maxDepth]) {
        const at = (power: number) =>
          waterPoint(direction, landingShare(depth, power));
        for (let power = 0; power <= maxPower; power++) {
          const { band, landing, precise } = preview(direction, depth, power);
          expect(band).toEqual({ low: at(PRECISE.min), high: at(PRECISE.max) });
          // The green runs out along the aim; precise casts land on it, others do not.
          const onGreen =
            landing.y <= band.low.y + 1e-9 && landing.y >= band.high.y - 1e-9;
          expect(onGreen).toBe(power >= PRECISE.min && power <= PRECISE.max);
          // The ring turns green exactly when Core would count the cast precise.
          expect(precise).toBe(precisePower(power));
          expect(precise).toBe(onGreen);
        }
      }
  });
});
