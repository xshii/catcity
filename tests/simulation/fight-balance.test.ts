import { expect, it } from 'vitest';
import { CAT_BREED_IDS, type CatBreed } from '../../src/content/breeds';
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
import { PLAYERS, rodTip } from '../helpers/motion-player';

/**
 * Motion fight balance (spec 030): the simulated players of `tests/helpers/motion-player`.
 * Straight runs are easy; turns, pace changes and dashes are not. High-star fish must need
 * a practised player.
 */
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
/** Players pull back on dashes, ignore them, or fight with the tug switched off. */
type Dashes = 'pull' | 'ignore' | 'off';

/** A plain (not perfect) strike on a fish of the given stars. */
function fightOf(
  seed: number,
  stars: number,
  happy: boolean,
  catBreed: CatBreed = 'RAGDOLL',
): AnglingRun {
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
      catBreed,
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
function catchRate(
  player: keyof typeof PLAYERS,
  stars: number,
  happy = false,
  dashes: Dashes = 'pull',
) {
  const key = `${player}${stars}${happy}${dashes}`;
  if (!rates.has(key)) rates.set(key, measure(player, stars, happy, dashes));
  return rates.get(key)!;
}
function measure(
  player: keyof typeof PLAYERS,
  stars: number,
  happy: boolean,
  dashes: Dashes,
) {
  const { jitter } = PLAYERS[player];
  let caught = 0;
  for (let seed = 1; seed <= SAMPLES; seed++) {
    const hand = new RandomService(seed * 7919);
    const wobble = () => hand.nextInt(2 * jitter + 1) - jitter;
    let run = fightOf(seed, stars, happy);
    const fish = fishPath(run, M.fight.graceTicks + M.fight.limitTicks);
    while (run.phase === 'fight') {
      // With the tug off the line never tightens: tension goes back to slack each tick.
      run = stepMotionRun(
        dashes === 'off' ? { ...run, tension: 0 } : run,
        rodTip(player, run, fish, wobble, dashes === 'pull'),
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

// One case per player and star, so each stays small (rates are cached across cases).
it.each(
  (Object.keys(PLAYERS) as (keyof typeof PLAYERS)[]).flatMap((player) =>
    STARS.map((stars) => [player, stars] as const),
  ),
)('never makes a happy %s run harder at %i★', (player, stars) => {
  expect(catchRate(player, stars, true)).toBeGreaterThanOrEqual(
    catchRate(player, stars),
  );
});

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

/**
 * The tug of war (spec 033) must reward pulling back, not gate skilled players: pulling
 * back costs them at most `maxCut` points on high-star fish against a fight without the
 * tug, while ignoring dashes snaps enough lines to cost at least `ignoreCut` on 5★ fish.
 */
const TUG = { maxCut: 10, ignoreCut: 20 };

it.each([3, 4, 5])(
  'costs skilled players who pull back little on %i★ fish',
  (stars) => {
    const cut =
      catchRate('skilled', stars, false, 'off') - catchRate('skilled', stars);
    expect(cut, `skilled ${stars}★ lost ${cut} points`).toBeLessThanOrEqual(
      TUG.maxCut,
    );
  },
);

it('snaps lines of players who ignore dashes on 5★ fish', () => {
  const cut =
    catchRate('skilled', 5) - catchRate('skilled', 5, false, 'ignore');
  expect(cut, `ignoring dashes lost ${cut} points`).toBeGreaterThanOrEqual(
    TUG.ignoreCut,
  );
});

/**
 * The stray a game starts with may be any breed (spec 041 T-14). A breed only decides which
 * fish may bite; once hooked, a fish fights the same for every cat, so the rates above hold
 * whatever the breed.
 */
it('fights a hooked fish the same with a cat of every breed', () => {
  const { jitter } = PLAYERS.skilled;
  const fight = (seed: number, stars: number, breed: CatBreed) => {
    const hand = new RandomService(seed * 7919);
    const wobble = () => hand.nextInt(2 * jitter + 1) - jitter;
    let run = fightOf(seed, stars, false, breed);
    const fish = fishPath(run, M.fight.graceTicks + M.fight.limitTicks);
    while (run.phase === 'fight')
      run = stepMotionRun(run, rodTip('skilled', run, fish, wobble, true), 1);
    // Compared apart from the breed each run was given.
    return { ...run, catBreed: null };
  };
  for (const stars of STARS)
    for (let seed = 1; seed <= 5; seed++) {
      const [first, ...others] = CAT_BREED_IDS.map((breed) =>
        fight(seed, stars, breed),
      );
      for (const other of others) expect(other).toEqual(first);
    }
});
