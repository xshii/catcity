import { CARE } from '../../content/care';
import type { CatEntity, Position } from '../../core';

/** A place in tile coordinates (fractions lie between tiles) and the real time to the tile. */
export interface Glide {
  x: number;
  y: number;
  /** Real milliseconds until the step completes at this clock speed. */
  msLeft: number;
}

/**
 * One step of a walk: the cat glides from the tile it leaves to the tile it enters for
 * all the game minutes the step takes. `speed` is game minutes per real second; it
 * changes the time left, never the place.
 */
export function walkGlide(step: {
  from: Position;
  to: Position;
  stepMinutes: number;
  spentMinutes: number;
  speed: number;
}): Glide {
  const { from, to, stepMinutes, speed } = step;
  const spent = Math.min(stepMinutes, Math.max(0, step.spentMinutes));
  const share = stepMinutes ? spent / stepMinutes : 1;
  return {
    x: from.x + (to.x - from.x) * share,
    y: from.y + (to.y - from.y) * share,
    msLeft: ((stepMinutes - spent) * 1000) / speed,
  };
}

/**
 * Where a cat is at `minute` (the world's minute plus the real time since that tick):
 * on its tile when it stands (no walk, or one paused by exhaustion), otherwise along
 * its route as Core has scheduled it, no further than its energy reaches. A pure reading
 * of the world: Core moves the cat, this only says where to draw it in between.
 */
export function walkerAt(
  cat: Pick<CatEntity, 'position' | 'walk' | 'needs'>,
  minute: number,
  minutesOf: (tile: Position) => number,
  speed: number,
): Glide {
  let from = cat.position;
  let ends = cat.walk?.nextStepMinute ?? null;
  if (!cat.walk || ends === null) return { ...from, msLeft: 0 };
  const steps = Math.floor(cat.needs.energy / CARE.walkEnergyPerTile);
  for (const [index, to] of cat.walk.route.slice(0, steps).entries()) {
    const stepMinutes = minutesOf(to);
    if (index) ends += stepMinutes;
    if (minute < ends)
      return walkGlide({
        from,
        to,
        stepMinutes,
        spentMinutes: stepMinutes - (ends - minute),
        speed,
      });
    from = to;
  }
  return { ...from, msLeft: 0 };
}

/**
 * Game minutes the drawing runs ahead of the last clock tick: real time at the chosen
 * speed, at most one tick (the clock adds `speed` minutes each real second). Changing
 * the speed goes on from the minutes reached.
 */
export const leadMinutes = (lead: number, realMs: number, speed: number) =>
  Math.max(lead, Math.min(speed, lead + (realMs * speed) / 1000));

/** A far sprite closes a fixed share of the gap each second, and never crawls. */
const CATCH_UP = { perSecond: 2.5, tilesPerSecond: 4 } as const;

/**
 * Move a sprite towards where Core puts it (world px). A walking cat is followed
 * exactly; after a jump (waiting ten minutes, a replanned or blocked walk) the sprite
 * glides there quickly instead of appearing.
 */
export function catchUp(
  at: { x: number; y: number },
  target: { x: number; y: number },
  realMs: number,
  tilePx: number,
) {
  const dx = target.x - at.x;
  const dy = target.y - at.y;
  const gap = Math.hypot(dx, dy);
  const reach =
    (Math.max(CATCH_UP.tilesPerSecond * tilePx, gap * CATCH_UP.perSecond) *
      realMs) /
    1000;
  if (gap <= reach) return { ...target };
  return { x: at.x + (dx * reach) / gap, y: at.y + (dy * reach) / gap };
}
