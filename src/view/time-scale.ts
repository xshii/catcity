import { FISHING } from '../content/fishing';

/**
 * Test builds fast-forward pure waits (waiting for a bite, sensor start-up deadlines) so
 * browser regression stays short as cases grow. Phases that need a timely reaction
 * (strike, fight, throw window) keep real speed. Core time is tick-based and unaffected;
 * production always runs at 1×. One fishing command carries at most `input.maxTicks`.
 */
export const TIME_SCALE =
  import.meta.env.MODE === 'test' ? FISHING.input.maxTicks : 1;

/** Wall-clock milliseconds for a pure wait under the current scale. */
export const scaledMs = (ms: number) => ms / TIME_SCALE;
