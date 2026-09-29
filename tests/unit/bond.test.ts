import { describe, expect, it } from 'vitest';
import { advance, interact } from '../helpers/world';
import { fishingFixture, finishFishing } from './fishing-fixture';
import { createWorld, loadWorld, World } from '../../src/core/world';
import { BOND_LEVELS, CARE, bondLevel } from '../../src/content/care';
import { MOOD, moodRest } from '../../src/content/mood';
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

describe('bond levels (spec 034)', () => {
  it('are named 初识, 熟悉, 信任, 亲密, 家人 from 0, 5, 15, 30 and 60', () => {
    expect(BOND_LEVELS).toEqual([
      { name: '初识', bond: 0 },
      { name: '熟悉', bond: 5 },
      { name: '信任', bond: 15 },
      { name: '亲密', bond: 30 },
      { name: '家人', bond: 60 },
    ]);
  });

  it('derive from the bond alone, splitting exactly at each threshold', () => {
    expect(
      [0, 4, 5, 14, 15, 29, 30, 59, 60, 100].map((bond) => bondLevel(bond)),
    ).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('add no saved field', () => {
    expect(SAVE_VERSION).toBe(17);
    const world = edited(createWorld(42), (cat) => (cat.playerBond = 15));
    expect(Object.keys(cat(loadWorld(world.save())))).toEqual(
      Object.keys(cat(createWorld(42))),
    );
  });
});

describe('shared catches grow the bond', () => {
  it('by one for a fish caught together', () => {
    const world = fishingFixture(42);
    begin(world);
    finishFishing(world);
    expect(world.getSnapshot().fishing.lastResult).toMatchObject({
      caught: true,
      catchKind: 'fish',
    });
    expect(cat(world).playerBond).toBe(1);
    expect(cat(world).lastBondMinute).toBe(world.getSnapshot().minute);
    expect(
      world
        .getSnapshot()
        .cats.slice(1)
        .map((cat) => cat.playerBond),
    ).toEqual(
      world
        .getSnapshot()
        .cats.slice(1)
        .map(() => 0),
    );
  });

  it('under the hourly cap shared with chat and gifts', () => {
    const world = fishingFixture(42);
    begin(world);
    finishFishing(world);
    interact(world, 'mochi', '你好', '喵');
    const fish = world.getSnapshot().fishing.inventory[0]!;
    world.dispatch({ type: 'GIFT_FISH', fishId: fish.id, catId: 'mochi' });
    begin(world);
    finishFishing(world);
    expect(cat(world).playerBond).toBe(1);
    advance(world, CARE.bondCooldownMinutes - 1);
    begin(world);
    finishFishing(world);
    expect(cat(world).playerBond).toBe(1);
    advance(world, 1);
    begin(world);
    finishFishing(world);
    expect(cat(world).playerBond).toBe(2);
    interact(world, 'mochi', '你好', '喵');
    expect(cat(world).playerBond).toBe(2);
  });

  it('a chat that already took the hour leaves the catch its mood only', () => {
    const world = edited(fishingFixture(42), (cat) => (cat.mood = 50));
    interact(world, 'mochi', '你好', '喵');
    begin(world);
    finishFishing(world);
    expect(cat(world).playerBond).toBe(1);
    expect(cat(world).mood).toBe(50 + MOOD.chat + MOOD.catch);
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
    expect(cat(world).lastBondMinute).toBeNull();
  });
});

describe('a closer cat rests at a higher mood', () => {
  const withBond = (bond: number, mood: number) =>
    edited(createWorld(42), (cat) => {
      cat.playerBond = bond;
      cat.mood = mood;
    });

  it('raises the resting mood by 3 for each level above 初识', () => {
    expect([0, 4, 5, 15, 30, 60, 100].map(moodRest)).toEqual([
      60, 60, 63, 66, 69, 72, 72,
    ]);
    expect(moodRest(0)).toBe(MOOD.rest);
  });

  it('drifts toward its own resting mood, never past it', () => {
    for (const [bond, rest] of [
      [0, 60],
      [5, 63],
      [60, 72],
    ] as const)
      for (const start of [rest - 1, rest, rest + 1, 0, 100]) {
        const world = withBond(bond, start);
        advance(world, 60 * 60);
        expect(cat(world).mood).toBe(rest);
      }
  });

  it('never lowers a mood that today’s rule would have left alone', () => {
    // Between the old and the new resting mood the cat now drifts up instead of down.
    const close = withBond(60, 66);
    const stranger = withBond(0, 66);
    advance(close, 60);
    advance(stranger, 60);
    expect(cat(close).mood).toBe(66 + MOOD.drift);
    expect(cat(stranger).mood).toBe(66 - MOOD.drift);
    for (const mood of [0, 30, 59, 60, 72, 73, 90, 100]) {
      const near = withBond(60, mood);
      const far = withBond(0, mood);
      advance(near, 60);
      advance(far, 60);
      expect(cat(near).mood).toBeGreaterThanOrEqual(cat(far).mood);
    }
  });

  it('gives the same result in one advance as in minute steps, across a save', () => {
    const world = withBond(30, 40);
    const stepwise = loadWorld(world.save());
    advance(world, 600);
    for (let minute = 0; minute < 600; minute++) advance(stepwise, 1);
    expect(stepwise.save()).toBe(world.save());
  });
});
