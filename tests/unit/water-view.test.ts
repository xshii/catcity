import { expect, it } from 'vitest';
import { FISHING, SPOT_IDS } from '../../src/content/fishing';
import { fishShadows } from '../../src/core';
import { shadowAt } from '../../src/core/fishing/shadows';
import {
  aimAtPoint,
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
