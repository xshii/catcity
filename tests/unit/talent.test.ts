import { describe, expect, it } from 'vitest';
import { BOND_LEVELS } from '../../src/content/care';
import {
  castCost,
  MAX_TALENT,
  NO_TALENT,
  TALENT_EFFECTS,
} from '../../src/content/family';
import { FISH_IDS, FISHING, fishById } from '../../src/content/fishing';
import { MOOD, moodAfterDrift } from '../../src/content/mood';
import { loadWorld, World, type WorldState } from '../../src/core';
import { applyCommand } from '../../src/core/reducer';
import {
  castAngling,
  greenZone,
  initialAngling,
  type AnglingRun,
} from '../../src/minigames/angling';
import {
  motionBounds,
  motionSchedule,
  stepMotionRun,
  strikeMotionRun,
} from '../../src/minigames/angling-motion';
import { PEPPER_ID, readyPair } from '../helpers/family';
import { catsAtPond } from './fishing-fixture';

// Spec 041 R-35 (design 5.4): what each level of a cat's three talents does. The numbers
// are content's (TALENT_EFFECTS), set by the balance and pacing simulations.

const LEVELS = Array.from({ length: MAX_TALENT + 1 }, (_, level) => level);

/**
 * Mochi (家人) and Pepper (亲密) and their kitten, whose three marks gave it one level of
 * each talent; all three at the pond. A valid save.
 */
function giftedKitten(): World {
  const state = readyPair().getSnapshot();
  state.cats[0]!.playerBond = BOND_LEVELS[4].bond;
  state.cats[1]!.playerBond = BOND_LEVELS[3].bond;
  const world = new World(state);
  const born = world.dispatch({
    type: 'BREED_CATS',
    motherId: 'mochi',
    fatherId: PEPPER_ID,
    name: '团子',
    sex: 'F',
  });
  if (!born.ok) throw new Error(born.error);
  return catsAtPond(world);
}
const KITTEN = 'cat-3';
const begin = (world: World, catId: string) =>
  world.dispatch({
    type: 'FISH_BEGIN',
    catId,
    spotId: 'POND',
    baitId: 'BREAD',
    direction: 30,
    aimDepth: 50,
    mode: 'motion',
  });

function run(feel: number, mode: 'buttons' | 'motion'): AnglingRun {
  return castAngling(
    initialAngling({
      id: 'angling-1',
      catId: 'mochi',
      seed: 7,
      baitId: 'WORM',
      direction: 30,
      aimDepth: 50,
      skillLevel: 1,
      spotId: 'POND',
      catBreed: 'RAGDOLL',
      mode,
      happy: false,
      feel,
    }),
    40,
  );
}

describe('钓感 (feel)', () => {
  it('is read from the cat into its run as the run begins', () => {
    const world = giftedKitten();
    expect(world.getSnapshot().cats[2]!.talent).toEqual({
      feel: 1,
      stamina: 1,
      affection: 1,
    });
    expect(begin(world, KITTEN).ok).toBe(true);
    expect(world.getSnapshot().fishing.active!.feel).toBe(1);
    const mochi = giftedKitten();
    expect(begin(mochi, 'mochi').ok).toBe(true);
    expect(mochi.getSnapshot().fishing.active!.feel).toBe(0);
  });

  it('must agree with its cat in a saved run', () => {
    const world = giftedKitten();
    begin(world, KITTEN);
    const save = JSON.parse(world.save());
    expect(() => loadWorld(JSON.stringify(save))).not.toThrow();
    save.world.fishing.active.feel = 0;
    expect(() => loadWorld(JSON.stringify(save))).toThrow(/active fishing/);
  });

  it('keeps a motion run’s strike window open longer by level', () => {
    const plain = motionBounds(run(0, 'motion')).strikeWindow;
    for (const feel of LEVELS)
      expect(motionBounds(run(feel, 'motion')).strikeWindow).toBe(
        plain + feel * TALENT_EFFECTS.feel.strikeTicks,
      );
    // A lift just after the plain window closed still hooks the fish with 钓感.
    const late = (start: AnglingRun) => {
      let next = start;
      for (let n = 0; n < motionSchedule(start).bite + plain; n++)
        next = stepMotionRun(next, null, 1);
      return next;
    };
    expect(late(run(0, 'motion')).phase).toBe('escaped');
    const gifted = late(run(1, 'motion'));
    expect(gifted.phase).toBe('hook');
    expect(strikeMotionRun(gifted).phase).toBe('fight');
  });

  it('widens a button run’s hook zone by level, and not its fight', () => {
    const width = (zone: { low: number; high: number }) => zone.high - zone.low;
    const threeStars = FISH_IDS.find((id) => fishById(id).stars === 3)!;
    for (const feel of LEVELS) {
      const plain = { ...run(0, 'buttons'), speciesId: threeStars };
      const gifted = { ...plain, feel };
      expect(width(greenZone({ ...gifted, phase: 'hook' }))).toBe(
        width(greenZone({ ...plain, phase: 'hook' })) +
          feel * TALENT_EFFECTS.feel.hookZone,
      );
      expect(greenZone({ ...gifted, phase: 'fight' })).toEqual(
        greenZone({ ...plain, phase: 'fight' }),
      );
    }
  });
});

describe('耐力 (stamina)', () => {
  it('costs a cast less stamina by level', () => {
    for (const stamina of LEVELS)
      expect(castCost(stamina)).toBe(
        FISHING.cast.staminaCost - stamina * TALENT_EFFECTS.stamina.castCost,
      );
    expect(castCost(MAX_TALENT)).toBeGreaterThan(0);
  });

  it('takes the cat’s own cost as it casts, and lets it begin with that much left', () => {
    const world = giftedKitten();
    begin(world, KITTEN);
    const runId = world.getSnapshot().fishing.active!.id;
    expect(world.dispatch({ type: 'FISH_CAST', runId, power: 40 }).ok).toBe(
      true,
    );
    expect(world.getSnapshot().cats[2]!.needs.energy).toBe(100 - castCost(1));
    const tired = (energy: number) => {
      const state = giftedKitten().getSnapshot();
      state.cats[2]!.needs.energy = energy;
      return begin(new World(state), KITTEN);
    };
    expect(tired(castCost(1)).ok).toBe(true);
    expect(tired(castCost(1) - 1)).toEqual({
      ok: false,
      error: 'LOW_STAMINA',
    });
  });
});

describe('亲人 (affection)', () => {
  const { gentleHours, everyHours } = TALENT_EFFECTS.affection;
  /** A happy cat's fall over `everyHours` hours on end, from 100, at this 亲人. */
  const fallOver = (affection: number, from = 0) =>
    Array.from(
      { length: everyHours },
      (_, hour) => 100 - moodAfterDrift(100, affection, from + hour),
    ).reduce((sum, fall) => sum + fall, 0);

  it('lets a happy cat fall one point less on some hours of every few, more of them by level', () => {
    expect(gentleHours[0]).toBe(0);
    for (const affection of LEVELS) {
      expect(fallOver(affection)).toBe(
        everyHours * MOOD.highDrift - gentleHours[affection]!,
      );
      // Whichever hour the count starts from.
      expect(fallOver(affection, 5)).toBe(fallOver(affection));
      if (affection)
        expect(gentleHours[affection]).toBeGreaterThan(
          gentleHours[affection - 1]!,
        );
    }
    // At most one point less an hour: 亲人 slows the fall, it never keeps a cat happy.
    expect(gentleHours[MAX_TALENT]).toBeLessThanOrEqual(everyHours);
    expect(MOOD.highDrift).toBeGreaterThan(1);
  });

  it('never lets a happy cat fall below where a calm cat lands, and leaves the calm drift alone', () => {
    const floor = MOOD.happy - 1 - MOOD.drift;
    for (const affection of LEVELS)
      for (let hour = 0; hour < everyHours; hour++) {
        expect(
          moodAfterDrift(MOOD.happy, affection, hour),
        ).toBeGreaterThanOrEqual(floor);
        expect(moodAfterDrift(MOOD.happy - 1, affection, hour)).toBe(
          MOOD.happy - 1 - MOOD.drift,
        );
      }
  });

  it('is the cat’s own as the city clock runs, hour by hour', () => {
    const state: WorldState = readyPair().getSnapshot();
    const [plain, gifted] = state.cats;
    plain!.mood = 100;
    gifted!.mood = 100;
    // A state built here, not a save: no first-generation cat has talents.
    gifted!.talent = { ...NO_TALENT, affection: MAX_TALENT };
    const hour = Math.floor(state.minute / 60) + 1;
    applyCommand(state, {
      type: 'ADVANCE_TIME',
      minutes: hour * 60 - state.minute,
    });
    expect(plain!.mood).toBe(moodAfterDrift(100, 0, hour));
    expect(gifted!.mood).toBe(moodAfterDrift(100, MAX_TALENT, hour));
    // A long advance is the same as one hour at a time.
    const stepped = structuredClone(state);
    applyCommand(state, { type: 'ADVANCE_TIME', minutes: 10 * 60 });
    for (let step = 0; step < 10; step++)
      applyCommand(stepped, { type: 'ADVANCE_TIME', minutes: 60 });
    expect(stepped.cats[1]!.mood).toBe(state.cats[1]!.mood);
  });
});
