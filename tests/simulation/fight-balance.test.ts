import { expect, it } from 'vitest';
import { FISH_IDS, FISHING, fishById } from '../../src/content/fishing';
import { RandomService } from '../../src/core/random';
import { castAngling, initialAngling } from '../../src/minigames/angling';
import type { AnglingRun } from '../../src/minigames/angling';
import {
  fishPath,
  motionSchedule,
  stepMotionRun,
  strikeMotionRun,
} from '../../src/minigames/angling-motion';

/**
 * Motion fight balance (spec 030): simulated players see the fish `delay` ticks late and
 * extrapolate its recent motion (smooth pursuit), with a wobbly hand. Straight runs are
 * easy; turns, pace changes and dashes are not. High-star fish must need a practised player.
 */
const PLAYERS = {
  novice: { delay: 8, jitter: 3 },
  competent: { delay: 5, jitter: 2 },
  skilled: { delay: 3, jitter: 1 },
};
/** Catch-rate bounds in percent: [player, stars, min, max]. */
const TARGETS: [keyof typeof PLAYERS, number, number, number][] = [
  ['novice', 0, 80, 100],
  ['novice', 5, 0, 10],
  ['competent', 0, 95, 100],
  ['competent', 3, 60, 100],
  ['competent', 5, 0, 50],
  ['skilled', 0, 95, 100],
  ['skilled', 3, 90, 100],
  ['skilled', 5, 80, 100],
];
const M = FISHING.motion;
const SAMPLES = 40;
/** Ticks of motion the player extrapolates from. */
const TREND = 4;

/** A plain (not perfect) strike on a fish of the given stars. */
function fightOf(seed: number, stars: number, happy: boolean): AnglingRun {
  const cast = castAngling(
    initialAngling({
      happy,
      id: 'angling-1',
      catId: 'mochi',
      seed,
      baitId: 'WORM',
      direction: 30,
      aimDepth: 50,
      skillLevel: 1,
      spotId: 'POND',
      catBreed: 'RAGDOLL',
      mode: 'motion',
    }),
    40,
  );
  let run = cast;
  for (let i = 0; i < motionSchedule(cast).bite; i++)
    run = stepMotionRun(run, null, 1);
  return {
    ...strikeMotionRun(run),
    speciesId: FISH_IDS.find((id) => fishById(id).stars === stars)!,
    strike: 'good',
    hold: 0,
  };
}

const rates = new Map<string, number>();
function catchRate(player: keyof typeof PLAYERS, stars: number, happy = false) {
  const key = `${player}${stars}${happy}`;
  if (!rates.has(key)) rates.set(key, measure(player, stars, happy));
  return rates.get(key)!;
}
function measure(player: keyof typeof PLAYERS, stars: number, happy: boolean) {
  const { delay, jitter } = PLAYERS[player];
  let caught = 0;
  for (let seed = 1; seed <= SAMPLES; seed++) {
    const hand = new RandomService(seed * 7919);
    const wobble = () => hand.nextInt(2 * jitter + 1) - jitter;
    let run = fightOf(seed, stars, happy);
    const fish = fishPath(run, M.fight.graceTicks + M.fight.limitTicks);
    while (run.phase === 'fight') {
      const now = Math.max(0, run.phaseTick + 1 - delay);
      const seen = fish[now]!;
      const earlier = fish[Math.max(0, now - TREND)]!;
      const aim = (at: number, before: number) =>
        Math.min(
          100,
          Math.max(
            0,
            Math.round(at + ((at - before) * delay) / TREND + wobble()),
          ),
        );
      run = stepMotionRun(
        run,
        { x: aim(seen.x, earlier.x), y: aim(seen.y, earlier.y) },
        1,
      );
    }
    if (run.phase === 'caught') caught++;
  }
  return Math.round((caught / SAMPLES) * 100);
}

it.each(TARGETS)(
  '%s players land %i★ fish within the target rate',
  (player, stars, min, max) => {
    const rate = catchRate(player, stars);
    expect(rate, `${player} ${stars}★ caught ${rate}%`).toBeGreaterThanOrEqual(
      min,
    );
    expect(rate, `${player} ${stars}★ caught ${rate}%`).toBeLessThanOrEqual(
      max,
    );
  },
);

it.each(Object.keys(PLAYERS) as (keyof typeof PLAYERS)[])(
  'never makes a higher-star fish easier for %s players',
  (player) => {
    const rates = [0, 1, 2, 3, 4, 5].map((stars) => catchRate(player, stars));
    for (let stars = 1; stars <= 5; stars++)
      // Sampling noise: allow one fish either way.
      expect(rates[stars]).toBeLessThanOrEqual(
        rates[stars - 1]! + 100 / SAMPLES,
      );
  },
);

/**
 * Happy runs (spec 032) get a slightly larger ring. The bonus must never make a fight
 * harder, must leave 4–5★ fish rare for novices, and must add little for skilled players.
 */
const HAPPY = { noviceHighStarMax: 15, skilledLiftMax: 10 };
const STARS = [0, 1, 2, 3, 4, 5];

it.each(Object.keys(PLAYERS) as (keyof typeof PLAYERS)[])(
  'never makes a happy run harder for %s players',
  (player) => {
    for (const stars of STARS)
      expect(catchRate(player, stars, true)).toBeGreaterThanOrEqual(
        catchRate(player, stars),
      );
  },
);

it.each([4, 5])('keeps %i★ fish rare for novices on a happy run', (stars) => {
  const rate = catchRate('novice', stars, true);
  expect(rate, `novice ${stars}★ happy caught ${rate}%`).toBeLessThanOrEqual(
    HAPPY.noviceHighStarMax,
  );
});

it('lifts skilled catch rates only a little on happy runs', () => {
  for (const stars of STARS)
    expect(
      catchRate('skilled', stars, true) - catchRate('skilled', stars),
    ).toBeLessThanOrEqual(HAPPY.skilledLiftMax);
});
