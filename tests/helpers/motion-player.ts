import { FISHING } from '../../src/content/fishing';
import type { AnglingRun } from '../../src/minigames/angling';
import type { FishState } from '../../src/minigames/angling-motion';

/**
 * Simulated motion-fishing players (spec 030): they see the fish `delay` ticks late and
 * extrapolate its recent motion (smooth pursuit), with a wobbly hand. Once they see a dash
 * announced (as late as they see everything), they pull the rod tip `PULL` units back
 * toward themselves until the dash is over (spec 033 tug of war).
 */
export const PLAYERS = {
  novice: { delay: 8, jitter: 3 },
  competent: { delay: 5, jitter: 2 },
  skilled: { delay: 3, jitter: 1 },
};
export type Player = keyof typeof PLAYERS;
/** Ticks of motion the player extrapolates from. */
const TREND = 4;
/** How far behind the fish a player pulls during a dash. */
const PULL = FISHING.motion.fight.tug.marginUnits + 4;

/**
 * Where the player holds the rod tip on the next fight tick of `run`; `fish` is the run's
 * `fishPath` and `wobble` the hand's next error (drawn for x, then for y).
 */
export function rodTip(
  player: Player,
  run: AnglingRun,
  fish: readonly FishState[],
  wobble: () => number,
  pullsBack = true,
): { x: number; y: number } {
  const { delay } = PLAYERS[player];
  const now = Math.max(0, run.phaseTick + 1 - delay);
  const seen = fish[now]!;
  const earlier = fish[Math.max(0, now - TREND)]!;
  const pull = pullsBack && (seen.warning || seen.dashing) ? PULL : 0;
  const aim = (at: number, before: number, back = 0) =>
    Math.min(
      100,
      Math.max(
        0,
        Math.round(at + ((at - before) * delay) / TREND + wobble()) + back,
      ),
    );
  return { x: aim(seen.x, earlier.x), y: aim(seen.y, earlier.y, pull) };
}
