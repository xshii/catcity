import { describe, expect, it } from 'vitest';
import { advance, interact } from '../helpers/world';
import { fishingFixture, finishFishing } from './fishing-fixture';
import { createWorld, loadWorld, World } from '../../src/core/world';
import { BOND, BOND_LEVELS, bondLevel } from '../../src/content/care';
import { gameDay, spendDaily } from '../../src/core/bond';
import { MOOD, moodRest } from '../../src/content/mood';
import { MAX_BOND } from '../../src/core/limits';
import { SAVE_VERSION, type CatEntity } from '../../src/core/schema';

function edited(world: World, change: (cat: CatEntity) => void): World {
  const state = world.getSnapshot();
  change(state.cats[0]!);
  return new World(state);
}
const cat = (world: World) => world.getSnapshot().cats[0]!;
const begin = (world: World) =>
  world.dispatch({
    type: 'FISH_BEGIN',
    catId: 'mochi',
    spotId: 'POND',
    baitId: 'BREAD',
    direction: -30,
    aimDepth: 50,
  });

/** Thresholds and points are tuning: every test reads them from the content tables. */
const top = BOND_LEVELS.length - 1;
const topBond = BOND_LEVELS[top]!.bond;
const catchFish = (world: World) => {
  begin(world);
  finishFishing(world);
};
const chat = (world: World, catId = 'mochi') =>
  interact(world, catId, '你好', '喵');
/** Gives the first fish in the bag to a cat. */
const gift = (world: World, catId: string) =>
  world.dispatch({
    type: 'GIFT_FISH',
    fishId: world.getSnapshot().fishing.inventory[0]!.id,
    catId,
  });

describe('bond levels (spec 036)', () => {
  it('are one table of named levels, rising from 0 within the bond range', () => {
    expect(BOND_LEVELS.map((level) => level.name)).toEqual([
      '初识',
      '熟悉',
      '信任',
      '亲密',
      '家人',
    ]);
    expect(BOND_LEVELS[0].bond).toBe(0);
    for (const [index, level] of BOND_LEVELS.entries()) {
      expect(Number.isInteger(level.bond)).toBe(true);
      expect(level.bond).toBeLessThanOrEqual(MAX_BOND);
      if (index)
        expect(level.bond).toBeGreaterThan(BOND_LEVELS[index - 1]!.bond);
    }
  });

  it('derive from the bond alone, splitting exactly at each threshold', () => {
    for (const [index, level] of BOND_LEVELS.entries()) {
      expect(bondLevel(level.bond)).toBe(index);
      if (index) expect(bondLevel(level.bond - 1)).toBe(index - 1);
    }
    expect(bondLevel(MAX_BOND)).toBe(top);
  });

  it('are derived: the save holds points, never a level', () => {
    expect(SAVE_VERSION).toBe(18);
    const world = edited(
      createWorld(42),
      (cat) => (cat.playerBond = BOND_LEVELS[1].bond),
    );
    expect(Object.keys(cat(loadWorld(world.save())))).toEqual(
      Object.keys(cat(createWorld(42))),
    );
  });
});

describe('bond points (spec 038)', () => {
  it('a fish caught together earns the run cat its points, and no other cat', () => {
    const world = fishingFixture(42);
    world.dispatch({ type: 'INVITE_PEPPER' });
    catchFish(world);
    expect(world.getSnapshot().fishing.lastResult).toMatchObject({
      caught: true,
      catchKind: 'fish',
    });
    expect(world.getSnapshot().cats.map((cat) => cat.playerBond)).toEqual([
      BOND.catch,
      0,
    ]);
  });

  it('every catch counts: the clock no longer limits the bond', () => {
    // Calm enough to stay calm after the first catch cheers it up.
    const world = edited(fishingFixture(42), (cat) => (cat.mood = 40));
    catchFish(world);
    catchFish(world);
    expect(cat(world).mood).toBeLessThan(MOOD.happy);
    expect(cat(world).playerBond).toBe(2 * BOND.catch);
  });

  it('a favourite fish given earns more than another fish', () => {
    let world = fishingFixture(42);
    world.dispatch({ type: 'INVITE_PEPPER' });
    catchFish(world);
    catchFish(world);
    // The catches cheered Mochi up; a calm cat shows the plain points.
    world = edited(world, (cat) => (cat.mood = MOOD.happy - 1));
    const [mochi, pepper] = world.getSnapshot().cats;
    const before = mochi!.playerBond;
    // Both pond fish are Mochi's favourites and neither is Pepper's.
    expect(gift(world, mochi!.id).ok).toBe(true);
    expect(gift(world, pepper!.id).ok).toBe(true);
    const after = world.getSnapshot().cats;
    expect(after[0]!.fishGift!.favorite).toBe(true);
    expect(after[1]!.fishGift!.favorite).toBe(false);
    expect(after[0]!.playerBond).toBe(before + BOND.favoriteGift);
    expect(after[1]!.playerBond).toBe(BOND.gift);
    expect(BOND.favoriteGift).toBeGreaterThan(BOND.gift);
  });

  it('a chat earns points once per cat and game day', () => {
    const world = createWorld(42);
    world.dispatch({ type: 'INVITE_PEPPER' });
    const bonds = () => world.getSnapshot().cats.map((cat) => cat.playerBond);
    const pepper = world.getSnapshot().cats[1]!.id;
    chat(world);
    chat(world);
    expect(bonds()).toEqual([BOND.chat, 0]);
    chat(world, pepper);
    expect(bonds()).toEqual([BOND.chat, BOND.chat]);
    const minute = world.getSnapshot().minute;
    advance(world, BOND.dayMinutes - (minute % BOND.dayMinutes) - 1);
    chat(world);
    expect(bonds()).toEqual([BOND.chat, BOND.chat]);
    advance(world, 1);
    chat(world);
    chat(world);
    expect(bonds()).toEqual([2 * BOND.chat, BOND.chat]);
  });

  it('a chat and a catch on the same day both count', () => {
    const world = edited(fishingFixture(42), (cat) => (cat.mood = 50));
    chat(world);
    catchFish(world);
    expect(cat(world).playerBond).toBe(BOND.chat + BOND.catch);
    expect(cat(world).mood).toBe(50 + MOOD.chat + MOOD.catch);
  });

  it('each source earns one more from a cat that is happy at that moment', () => {
    /** What each source adds for a cat in this mood just before it happens. */
    const happy = (mood: number) => {
      let world = fishingFixture(42);
      const steps = [
        catchFish,
        (world: World) => gift(world, 'mochi'),
        (world: World) => chat(world),
      ];
      return steps.map((step) => {
        world = edited(world, (cat) => (cat.mood = mood));
        const before = cat(world).playerBond;
        step(world);
        return cat(world).playerBond - before;
      });
    };
    expect(happy(MOOD.happy - 1)).toEqual([
      BOND.catch,
      BOND.favoriteGift,
      BOND.chat,
    ]);
    expect(happy(MOOD.happy)).toEqual([
      BOND.catch + BOND.happy,
      BOND.favoriteGift + BOND.happy,
      BOND.chat + BOND.happy,
    ]);
  });

  it('stops at the limit, above the last level', () => {
    expect(MAX_BOND).toBeGreaterThan(topBond);
    const world = edited(fishingFixture(42), (cat) => {
      cat.playerBond = MAX_BOND - 1;
      cat.mood = MOOD.happy;
    });
    catchFish(world);
    expect(cat(world).playerBond).toBe(MAX_BOND);
    expect(loadWorld(world.save()).save()).toBe(world.save());
    const over = createWorld(42).getSnapshot();
    over.cats[0]!.playerBond = MAX_BOND + 1;
    expect(() => new World(over)).toThrow();
  });

  it('not for a cancelled run or a fish that got away', () => {
    const world = fishingFixture(42);
    begin(world);
    const runId = world.getSnapshot().fishing.active!.id;
    expect(world.dispatch({ type: 'FISH_CANCEL', runId }).ok).toBe(true);
    expect(cat(world).playerBond).toBe(0);
    begin(world);
    const missed = world.getSnapshot().fishing.active!.id;
    world.dispatch({ type: 'FISH_CAST', runId: missed, power: 70 });
    for (let n = 0; n < 200 && world.getSnapshot().fishing.active; n++)
      world.dispatch({
        type: 'FISH_CONTROL',
        runId: missed,
        pressed: false,
        ticks: 1,
      });
    expect(world.getSnapshot().fishing.lastResult!.caught).toBe(false);
    expect(cat(world).playerBond).toBe(0);
  });

  it('a rejected chat or gift leaves the world unchanged', () => {
    const world = fishingFixture(42);
    catchFish(world);
    const before = world.save();
    expect(chat(world, 'ghost').ok).toBe(false);
    expect(gift(world, 'ghost').ok).toBe(false);
    expect(
      world.dispatch({ type: 'GIFT_FISH', fishId: 'fish-999', catId: 'mochi' })
        .ok,
    ).toBe(false);
    expect(world.save()).toBe(before);
  });

  it('keeps the day’s chat across a save and rejects one from the future', () => {
    const world = createWorld(42);
    chat(world);
    const restored = loadWorld(world.save());
    expect(restored.save()).toBe(world.save());
    chat(restored);
    expect(cat(restored).playerBond).toBe(BOND.chat);
    expect(cat(restored).chatBond).toEqual({
      day: gameDay(world.getSnapshot().minute),
      count: 1,
    });
    for (const chatBond of [
      { day: gameDay(world.getSnapshot().minute) + 1, count: 1 },
      { day: 0, count: BOND.chatsPerDay + 1 },
      { day: 0, count: 0 },
    ]) {
      const state = world.getSnapshot();
      state.cats[0]!.chatBond = chatBond;
      expect(() => new World(state)).toThrow();
    }
  });
});

describe('a daily allowance', () => {
  it('counts uses within a game day and starts again the next day', () => {
    const day = BOND.dayMinutes;
    expect(gameDay(0)).toBe(0);
    expect(gameDay(day - 1)).toBe(0);
    expect(gameDay(day)).toBe(1);
    expect(spendDaily(null, 5, 3)).toEqual({ day: 0, count: 1 });
    expect(spendDaily({ day: 0, count: 2 }, day - 1, 3)).toEqual({
      day: 0,
      count: 3,
    });
    expect(spendDaily({ day: 0, count: 3 }, day - 1, 3)).toBeNull();
    expect(spendDaily({ day: 0, count: 3 }, day, 3)).toEqual({
      day: 1,
      count: 1,
    });
  });
});

describe('a closer cat rests at a higher mood', () => {
  const withBond = (bond: number, mood: number) =>
    edited(createWorld(42), (cat) => {
      cat.playerBond = bond;
      cat.mood = mood;
    });

  it('raises the resting mood by the same step for each level above the first', () => {
    for (const [index, level] of BOND_LEVELS.entries()) {
      const rest = MOOD.rest + index * MOOD.restPerBondLevel;
      expect(moodRest(level.bond)).toBe(rest);
      if (index)
        expect(moodRest(level.bond - 1)).toBe(rest - MOOD.restPerBondLevel);
    }
    expect(moodRest(0)).toBe(MOOD.rest);
    expect(moodRest(MAX_BOND)).toBe(moodRest(topBond));
  });

  it('never rests a cat in the happy band: happiness still takes shared moments', () => {
    expect(moodRest(MAX_BOND) + MOOD.home).toBeLessThan(MOOD.happy);
  });

  it('drifts toward its own resting mood, never past it', () => {
    for (const level of BOND_LEVELS) {
      const rest = moodRest(level.bond);
      for (const start of [rest - 1, rest, rest + 1, 0, 100]) {
        const world = withBond(level.bond, start);
        advance(world, 60 * 60);
        expect(cat(world).mood).toBe(rest);
      }
    }
  });

  it('never lowers a mood that today’s rule would have left alone', () => {
    // Between the old and the new resting mood the cat now drifts up instead of down.
    const between = MOOD.rest + MOOD.drift;
    expect(moodRest(topBond)).toBeGreaterThanOrEqual(between + MOOD.drift);
    const close = withBond(topBond, between);
    const stranger = withBond(0, between);
    advance(close, 60);
    advance(stranger, 60);
    expect(cat(close).mood).toBe(between + MOOD.drift);
    expect(cat(stranger).mood).toBe(between - MOOD.drift);
    for (const level of BOND_LEVELS)
      for (let mood = 0; mood <= 100; mood++) {
        const near = withBond(level.bond, mood);
        const far = withBond(0, mood);
        advance(near, 60);
        advance(far, 60);
        expect(cat(near).mood).toBeGreaterThanOrEqual(cat(far).mood);
      }
  });

  it('gives the same result in one advance as in minute steps, across a save', () => {
    const world = withBond(topBond, 40);
    const stepwise = loadWorld(world.save());
    advance(world, 600);
    for (let minute = 0; minute < 600; minute++) advance(stepwise, 1);
    expect(stepwise.save()).toBe(world.save());
  });
});
