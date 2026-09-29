import type { SpotId } from '../../content/fishing';
import { FISHING } from '../../content/fishing';
import { shadowUnderCast, type WorldState } from '../../core';

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
  /** The aiming ring (width × height at the dock's scale), flattened by perspective. */
  ring: { width: 56, height: 20 },
  /** A cast's flight from the rod tip: how high it rises midway; its preview's dashes. */
  flight: { lift: 60, dashes: 12 },
  /**
   * A button fight's hooked fish: below and behind the float, swaying (at the dock's
   * scale), and at full progress `approach` of the way from there to the dock.
   */
  hooked: { below: 24, behind: 20, sway: 16, approach: 0.35 },
} as const;
type Point = { x: number; y: number };

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
 * Where a cast's float is `t` (0 the rod tip … 1 the landing) into its flight. The float
 * flies this path when cast, and the aiming preview draws it dashed (spec 033 F5).
 */
export function flightPoint(tip: Point, landing: Point, t: number): Point {
  return {
    x: tip.x + (landing.x - tip.x) * t,
    y: tip.y + (landing.y - tip.y) * t - Math.sin(t * Math.PI) * V.flight.lift,
  };
}

/**
 * The aiming preview (spec 033 F5, F5b): the ring where this cast would land (the mapping
 * the shadows are drawn with), the float's flight onto it from the rod `tip`, and the fish
 * shadow Core says the cast would land on (the ring turns green on one), or null.
 */
export function castPreview(
  world: Pick<WorldState, 'seed' | 'minute'>,
  spotId: SpotId,
  cast: { direction: number; aimDepth: number; power: number },
  tip: Point,
) {
  const landing = waterPoint(
    cast.direction,
    landingShare(cast.aimDepth, cast.power),
  );
  // Dash, gap, …, dash: the last dash ends on the ring.
  const steps = 2 * V.flight.dashes - 1;
  return {
    landing,
    /** The flight, dashed from each even point to the next. */
    arc: Array.from({ length: steps + 1 }, (_, i) =>
      flightPoint(tip, landing, i / steps),
    ),
    shadow: shadowUnderCast(world, spotId, cast),
  };
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

/**
 * The motion fight plane on the page: a square over the open water of the canvas as
 * drawn (`art`), in pixels from the corner of the box that holds it (`box`). The motion
 * overlay and the settings gear at its corner are both placed by this.
 */
export function planeBox(
  box: { left: number; top: number },
  art: { left: number; top: number; width: number; height: number },
) {
  const { left, top, side } = V.plane;
  return {
    left: art.left - box.left + art.width * left,
    top: art.top - box.top + art.height * top,
    side: art.width * side,
  };
}

/**
 * A button fight's hooked fish under the float `landing` (spec 033 F1): it sways as it
 * pulls, and as the fight's `progress` (0–100) fills it grows and swims part of the way
 * to the dock, so it looks closer; `near` (0–1) is how far along that is.
 */
export function hookedFish(
  landing: { x: number; y: number; scale: number },
  progress: number,
  tick: number,
) {
  const { below, behind, sway, approach } = V.hooked;
  const near = clamp(progress / 100, 0, 1);
  const y = landing.y + below * landing.scale;
  return {
    x: landing.x - behind * landing.scale + Math.sin(tick / 10) * sway,
    y: y + Math.max(0, V.nearY - y) * approach * near,
    scale: landing.scale * (1 + near),
    near,
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
