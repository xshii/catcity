import { expect, it } from 'vitest';
import {
  MAX_TALENT,
  NO_TALENT,
  TALENT_EFFECTS,
} from '../../src/content/family';
import { FISH_IDS, FISHING, fishById } from '../../src/content/fishing';
import { MOOD } from '../../src/content/mood';
import { PETTING } from '../../src/content/petting';
import { createWorld } from '../../src/core';
import { pettingLiftsLeft, pettingTastes } from '../../src/core/petting';
import { RandomService } from '../../src/core/random';
import { applyCommand } from '../../src/core/reducer';
import {
  castAngling,
  initialAngling,
  type AnglingRun,
} from '../../src/minigames/angling';
import {
  fishPath,
  motionSchedule,
  stepMotionRun,
  strikeMotionRun,
} from '../../src/minigames/angling-motion';
import { PLAYERS, rodTip } from '../helpers/motion-player';

/**
 * Talent balance (spec 041 R-35, design 5.4): a cat of full talents (4 of each) may help a
 * novice a little, never much. Its 4★ catch rate is at most 10 points above that of a
 * cat without talents, for a player who never has a happy cat, one who pets between
 * casts, and one whose cat is always happy.
 *
 * The run from the bite on: the player lifts `delay` ticks into the bite, give or take
 * the hand's jitter, as its rod hand wobbles (tests/helpers/motion-player); a lift after
 * the strike window loses the fish; a hooked fish is fought as in fight-balance.test.ts.
 * 耐力 changes no catch. 亲人 keeps a petted cat happy longer: the share of happy casts
 * comes from a petting player's day (below), and it weighs the happy and calm rates.
 *
 * Measured 2026-09-30 (TALENT_EFFECTS: 钓感 1 tick of strike window a level, 亲人 a
 * happy cat's hourly fall 4 → 3 at levels 2–3 and → 2 at 4; 200 fish): a novice lands
 * 1.5% of calm and 15% of happy 4★ runs without talents, 3% and 15.5% with full ones;
 * the lift is hooked on 71% of calm bites without 钓感 and on every one from 2 levels
 * up, but the fight decides the catch. The petting player's cat is happy on 55% / 60%
 * of casts at 30 / 60 minutes without 亲人 and on nearly all (99.7%) with 4, so its
 * lift is the largest: 6.5 / 5.9 points. (Without catches in the petting day, which lift
 * a calm cat a little, the happy share without 亲人 is lower than pacing.test.ts's 80%,
 * so the lift here is an upper bound.)
 */
const LIFT_MAX = 10;
const SAMPLES = 200;
const STARS = 4;
const M = FISHING.motion;

/** The share (percent) of fish of `STARS` a novice lands from the bite on. */
function landRate(feel: number, happy: boolean): number {
  const { delay, jitter } = PLAYERS.novice;
  let caught = 0;
  for (let seed = 1; seed <= SAMPLES; seed++) {
    const hand = new RandomService(seed * 7919);
    const wobble = () => hand.nextInt(2 * jitter + 1) - jitter;
    let run: AnglingRun = {
      ...castAngling(
        initialAngling({
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
          happy,
          feel,
        }),
        40,
      ),
      speciesId: FISH_IDS.find((id) => fishById(id).stars === STARS)!,
    };
    const bite = motionSchedule(run).bite;
    for (let tick = 0; tick < bite; tick++) run = stepMotionRun(run, null, 1);
    const lift = delay + wobble();
    for (let tick = 0; tick < lift && run.phase === 'hook'; tick++)
      run = stepMotionRun(run, null, 1);
    if (run.phase !== 'hook') continue;
    run = strikeMotionRun(run);
    const fish = fishPath(run, M.fight.graceTicks + M.fight.limitTicks);
    while (run.phase === 'fight')
      run = stepMotionRun(run, rodTip('novice', run, fish, wobble, true), 1);
    if (run.phase === 'caught') caught++;
  }
  return (caught / SAMPLES) * 100;
}

const CASTS = 300;
/**
 * The share (percent) of casts a petting player begins with a happy cat of this 亲人:
 * between casts, while the cat is not happy and the petting allowance has a lift, one
 * perfect round (tests/simulation/pacing.test.ts). The casts only pass the time; a catch
 * never makes a cat happy (spec 038). A state built here, not a save: no first-generation
 * cat has talents.
 */
function happyShare(affection: number, minutes: number): number {
  const state = createWorld(42).getSnapshot();
  const mochi = state.cats[0]!;
  mochi.talent = { ...NO_TALENT, affection };
  const { favourite } = pettingTastes(state.seed, mochi.id);
  const perfect = Array.from(
    { length: (2 * PETTING.roundTicks) / PETTING.purr.periodTicks },
    (_, stroke) => ({
      tick:
        Math.floor(stroke / 2) * PETTING.purr.periodTicks +
        (stroke % 2) * Math.floor(PETTING.purr.windowTicks / 2),
      spot: favourite,
    }),
  );
  let happy = 0;
  for (let cast = 0; cast < CASTS; cast++) {
    if (mochi.mood < MOOD.happy && pettingLiftsLeft(mochi, state.minute) > 0)
      applyCommand(state, {
        type: 'PET_CAT',
        catId: mochi.id,
        strokes: perfect,
      });
    if (mochi.mood >= MOOD.happy) happy++;
    applyCommand(state, { type: 'ADVANCE_TIME', minutes });
  }
  return (happy / CASTS) * 100;
}

const rates = new Map<string, number>();
const rate = (feel: number, happy: boolean) => {
  const key = `${feel} ${happy}`;
  if (!rates.has(key)) rates.set(key, landRate(feel, happy));
  return rates.get(key)!;
};
/** A player's 4★ catch rate with a cat happy on `share` percent of its casts. */
const mixed = (feel: number, share: number) =>
  (share * rate(feel, true) + (100 - share) * rate(feel, false)) / 100;

it('gives 钓感 a wider strike window, and the rod hand still decides the fight', () => {
  expect(TALENT_EFFECTS.feel.strikeTicks).toBeGreaterThan(0);
  for (const happy of [false, true])
    expect(rate(MAX_TALENT, happy)).toBeGreaterThanOrEqual(rate(0, happy));
});

it.each([
  ['never has a happy cat', 0, 0],
  ['has an always happy cat', 100, 100],
])(
  'lifts the 4★ catch rate of a novice who %s by at most 10 points with full talents',
  (_, without, full) => {
    const lift = mixed(MAX_TALENT, full) - mixed(0, without);
    expect(lift, `lift ${lift.toFixed(1)} points`).toBeLessThanOrEqual(
      LIFT_MAX,
    );
  },
);

it.each([30, 60])(
  'lifts the 4★ catch rate of a novice who pets between casts every %i minutes by at most 10 points with full talents',
  (minutes) => {
    const without = happyShare(0, minutes);
    const full = happyShare(MAX_TALENT, minutes);
    expect(full).toBeGreaterThanOrEqual(without);
    const lift = mixed(MAX_TALENT, full) - mixed(0, without);
    expect(
      lift,
      `happy ${without.toFixed(0)}% → ${full.toFixed(0)}%, lift ${lift.toFixed(1)} points`,
    ).toBeLessThanOrEqual(LIFT_MAX);
  },
);
