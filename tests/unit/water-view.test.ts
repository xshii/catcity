import { expect, it } from 'vitest';
import { FISHING } from '../../src/content/fishing';
import {
  aimAtPoint,
  landingShare,
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

it('turns a tap on the water back into the aim that lands there', () => {
  const { maxDirection } = FISHING.input;
  for (const direction of [-maxDirection, -20, 0, 25, maxDirection])
    for (const depth of [0, 40, 100]) {
      // Aim previews combine depth with the preview power; tap aiming ignores power.
      const share = V.reach.near + ((V.reach.far - V.reach.near) * depth) / 100;
      const { x, y } = waterPoint(direction, share);
      expect(aimAtPoint(x, y)).toEqual({ direction, depth });
    }
  expect(aimAtPoint(V.centerX, V.horizonY - 10)).toBeNull();
  expect(aimAtPoint(V.centerX, V.nearY + 10)).toBeNull();
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
