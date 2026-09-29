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
/** The aim sliders move in steps of 5. */
const snap = (value: number) => Math.round(value / 5) * 5;

/** How far out a cast lands (0 dock … 1 horizon) from the aimed depth and power. */
export function landingShare(aimDepth: number, power: number): number {
  const mix =
    (aimDepth + power) / (FISHING.input.maxDepth + FISHING.input.maxPower);
  return V.reach.near + (V.reach.far - V.reach.near) * clamp(mix, 0, 1);
}

/**
 * Canvas point of a fish shadow (spec 033) from Core's cast coordinates: `reach` is the
 * mean of aimed depth and power, so a cast meeting it head-on lands on this point.
 */
export function shadowPoint(direction: number, reach: number) {
  return waterPoint(direction, landingShare(reach, reach));
}

/** Perspective scale of something `share` out from the dock (1) toward the horizon. */
const depthScale = (share: number) => 1 - 0.7 * share;

/** Canvas point and perspective scale of a landing `share` out at `direction`. */
export function waterPoint(direction: number, share: number) {
  const y = V.nearY - share * (V.nearY - V.horizonY);
  const half = V.nearHalf + (V.horizonHalf - V.nearHalf) * share;
  const x =
    V.centerX + (direction / FISHING.input.maxDirection) * half * V.aimSpread;
  return { x, y, scale: depthScale(share) };
}

/**
 * Canvas point and perspective scale of a point on the motion fight plane (0–100 each
 * side), where the overlay draws the ring there.
 */
export function planePoint(point: { x: number; y: number }) {
  const { left, top, side } = V.plane;
  const y = V.size * (top + (side * point.y) / 100);
  return {
    x: V.size * (left + (side * point.x) / 100),
    y,
    scale: depthScale((V.nearY - y) / (V.nearY - V.horizonY)),
  };
}

/** Fish shadows swim while aiming and waiting; the fight shows the hooked fish instead. */
export function showsShadows(run: { phase: string } | null): boolean {
  return run?.phase !== 'fight';
}

/**
 * The aim a tap on the water asks for, or null off the water (button flow). The preview
 * lands by depth and power together, so the depth is solved for the preview `power`.
 */
export function aimAtPoint(x: number, y: number, power: number) {
  if (y < V.horizonY || y > V.nearY) return null;
  const share = (V.nearY - y) / (V.nearY - V.horizonY);
  const half = V.nearHalf + (V.horizonHalf - V.nearHalf) * share;
  const { maxDirection, maxDepth, maxPower } = FISHING.input;
  const mix = (share - V.reach.near) / (V.reach.far - V.reach.near);
  const direction = clamp(
    snap(((x - V.centerX) / (half * V.aimSpread)) * maxDirection),
    -maxDirection,
    maxDirection,
  );
  const depth = clamp(snap(mix * (maxDepth + maxPower) - power), 0, maxDepth);
  return { direction, depth };
}
