import { FISHING } from '../../content/fishing';
import { precisePower } from '../../minigames/angling';

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
  /**
   * The aiming preview's flight (spec 033 F5): its dashes, and how far its top rises as a
   * share of its climb up the screen.
   */
  arc: { dashes: 12, lift: 0.6 },
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

/**
 * The aiming preview (spec 033 F5): the ring where this aim and power land (the mapping
 * the shadows use, so a ring on a shadow is a cast Core finds on it), the dashed flight
 * arcing onto it `from` the rod, the green stretch of water where precise power lands
 * at this aim, and whether this power is precise (Core's rule).
 */
export function castPreview(
  direction: number,
  aimDepth: number,
  power: number,
  from: { x: number; y: number },
) {
  const landing = waterPoint(direction, landingShare(aimDepth, power));
  const top = V.arc.lift * (from.y - landing.y);
  // Dash, gap, …, dash: the last dash ends on the ring.
  const steps = 2 * V.arc.dashes - 1;
  const arc = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return {
      x: from.x + (landing.x - from.x) * t,
      y: from.y + (landing.y - from.y) * t - 4 * t * (1 - t) * top,
    };
  });
  const { min, max } = FISHING.cast.precisionPower;
  return {
    landing,
    /** Dash from each even point to the next. */
    arc,
    band: {
      low: waterPoint(direction, landingShare(aimDepth, min)),
      high: waterPoint(direction, landingShare(aimDepth, max)),
    },
    precise: precisePower(power),
  };
}

/** Canvas point and perspective scale of a landing `share` out at `direction`. */
export function waterPoint(direction: number, share: number) {
  const y = V.nearY - share * (V.nearY - V.horizonY);
  const half = V.nearHalf + (V.horizonHalf - V.nearHalf) * share;
  const x =
    V.centerX + (direction / FISHING.input.maxDirection) * half * V.aimSpread;
  return { x, y, scale: 1 - 0.7 * share };
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
