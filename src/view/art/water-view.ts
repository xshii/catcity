import { FISHING } from '../../content/fishing';

/**
 * First-person water geometry (spec 030) on the square river canvas: the player stands on
 * the dock looking out; the far shore sits on the horizon and the water widens toward the
 * dock. Shared by the river art, tapping the water to aim, and the motion fight plane.
 * Presentation only: Core never reads these numbers.
 */
export const WATER_VIEW = {
  size: 640,
  centerX: 320,
  horizonY: 150,
  nearY: 560,
  /** Half the water's width at the horizon and at the dock. */
  horizonHalf: 200,
  nearHalf: 330,
  /** Landing depth range, as shares from the dock (0) to the horizon (1). */
  reach: { near: 0.12, far: 0.82 },
  /** How much of the half-width the full aim direction reaches. */
  aimSpread: 0.8,
  /** The motion fight plane: a square over the open water, as canvas shares. */
  plane: { left: 0.2, top: 0.25, side: 0.6 },
} as const;

const V = WATER_VIEW;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** How far out a cast lands (0 dock … 1 horizon) from the aimed depth and power. */
export function landingShare(aimDepth: number, power: number): number {
  const mix =
    (aimDepth + power) / (FISHING.input.maxDepth + FISHING.input.maxPower);
  return V.reach.near + (V.reach.far - V.reach.near) * clamp(mix, 0, 1);
}

/** Canvas point and perspective scale of a landing `share` out at `direction`. */
export function waterPoint(direction: number, share: number) {
  const y = V.nearY - share * (V.nearY - V.horizonY);
  const half = V.nearHalf + (V.horizonHalf - V.nearHalf) * share;
  const x =
    V.centerX + (direction / FISHING.input.maxDirection) * half * V.aimSpread;
  return { x, y, scale: 1 - 0.7 * share };
}

/** The aim a tap on the water asks for, or null off the water (button flow). */
export function aimAtPoint(x: number, y: number) {
  if (y < V.horizonY || y > V.nearY) return null;
  const share = (V.nearY - y) / (V.nearY - V.horizonY);
  const half = V.nearHalf + (V.horizonHalf - V.nearHalf) * share;
  const { maxDirection, maxDepth } = FISHING.input;
  const step = 5;
  const direction = clamp(
    Math.round(
      (((x - V.centerX) / (half * V.aimSpread)) * maxDirection) / step,
    ) * step,
    -maxDirection,
    maxDirection,
  );
  const depth = clamp(
    Math.round(
      (((share - V.reach.near) / (V.reach.far - V.reach.near)) * maxDepth) /
        step,
    ) * step,
    0,
    maxDepth,
  );
  return { direction, depth };
}
