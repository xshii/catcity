import { expect, it } from 'vitest';
import { BOND } from '../../src/content/care';
import { FISH, skillXp } from '../../src/content/fishing';
import { WISH } from '../../src/content/wishes';
import { createWorld, loadWorld, World } from '../../src/core';
import type { CatEntity, WorldState } from '../../src/core';
import { advance, invite } from '../helpers/world';

// A wish is saved as its kind, its target and the day it came; the day the last one was
// granted beside it (spec 041 R-50 – R-53, design 7). A save cannot make up one that
// could not have come.

const DAY = BOND.dayMinutes;
const TODAY = 8;
/** The oldest a wish can be: the next day the cat changes its mind. */
const OLDEST = TODAY - (WISH.changeMindDays - 1);

/**
 * Day 8 of seed 42 with every water open: Mochi at home, with a cafe five tiles off,
 * wishing for a cafe near home since today, its last wish granted yesterday; Pepper
 * wishing for a moon carp for as long as it can before it changes its mind.
 */
function wishingCity(): World {
  const world = new World({
    ...createWorld(42).getSnapshot(),
    coins: 100_000,
  });
  const must = (command: unknown) =>
    expect(world.dispatch(command).ok).toBe(true);
  must({
    type: 'BUILD_BUILDING',
    buildingType: 'CAT_APARTMENT',
    position: { x: 4, y: 3 },
  });
  must({ type: 'ASSIGN_HOME', catId: 'mochi', buildingId: 'building-1' });
  must({
    type: 'BUILD_BUILDING',
    buildingType: 'CAT_CAFE',
    position: { x: 6, y: 6 },
  });
  invite(world);
  advance(world, TODAY * DAY - world.getSnapshot().minute + 60);
  const state = world.getSnapshot();
  state.fishing.xp = skillXp(5);
  for (const id of ['SILVER', 'CRUCIAN', 'PERCH', 'MACKEREL'] as const) {
    const fish = FISH.find((item) => item.id === id)!;
    state.fishing.atlas[id] = {
      count: 1,
      bestWeight: fish.minWeight,
      bestLengthMm: fish.minLengthMm,
    };
  }
  const [mochi, pepper] = state.cats;
  mochi!.wish = { kind: 'CAFE', target: null, sinceDay: TODAY };
  mochi!.lastWishDay = TODAY - 1;
  pepper!.wish = { kind: 'FISH', target: 'MOON_CARP', sinceDay: OLDEST };
  pepper!.lastWishDay = null;
  return new World(state);
}

it('saves each wish and the day of the last one granted, and restores them exactly', () => {
  const world = wishingCity();
  const save = JSON.parse(world.save());
  expect(
    save.world.cats.map((cat: CatEntity) => [cat.wish, cat.lastWishDay]),
  ).toEqual([
    [{ kind: 'CAFE', target: null, sinceDay: TODAY }, TODAY - 1],
    [{ kind: 'FISH', target: 'MOON_CARP', sinceDay: OLDEST }, null],
  ]);
  const loaded = loadWorld(world.save());
  expect(loaded.save()).toBe(world.save());
  // A reload carries on as if nothing happened: the cafe comes near, the next day Pepper
  // changes its mind, days go by.
  for (const game of [world, loaded]) {
    expect(
      game.dispatch({
        type: 'MOVE_BUILDING',
        buildingId: 'building-2',
        position: { x: 4, y: 4 },
      }).ok,
    ).toBe(true);
    expect(game.getSnapshot().cats[0]!.lastWishDay).toBe(TODAY);
    const changes = (OLDEST + WISH.changeMindDays) * DAY;
    expect(advance(game, changes - game.getSnapshot().minute).ok).toBe(true);
    const wish = game.getSnapshot().cats[1]!.wish!;
    expect(wish.sinceDay).toBe(TODAY + 1);
    expect(wish.kind).not.toBe('FISH');
    expect(advance(game, 10 * DAY).ok).toBe(true);
  }
  expect(loaded.save()).toBe(world.save());
});

it('rejects every wish a save makes up', () => {
  const base = JSON.parse(wishingCity().save());
  const tamper = (change: (state: WorldState) => void) => {
    const copy = structuredClone(base);
    change(copy.world);
    return () => loadWorld(JSON.stringify(copy));
  };
  const mochi = (state: WorldState) => state.cats[0]!;
  const pepper = (state: WorldState) => state.cats[1]!;
  const wish = (
    cat: CatEntity,
    kind: string,
    target: string | null,
    sinceDay = cat.wish!.sinceDay,
  ) => Object.assign(cat, { wish: { kind, target, sinceDay } });
  expect(tamper(() => undefined)).not.toThrow();
  // Each change below breaks one rule only: these are the wishes that could be.
  for (const allowed of [
    (state: WorldState) => wish(mochi(state), 'OUTING', 'COAST'),
    (state: WorldState) => wish(mochi(state), 'PETTING', null),
    (state: WorldState) => wish(pepper(state), 'FISH', 'PERCH'),
    (state: WorldState) => (mochi(state).wish = null),
    (state: WorldState) => (pepper(state).lastWishDay = 0),
  ])
    expect(tamper(allowed)).not.toThrow();
  for (const change of [
    // A kind there is not, or anything more than its three facts.
    (state: WorldState) => wish(mochi(state), 'TOY', null),
    (state: WorldState) =>
      Object.assign(mochi(state).wish!, { minute: state.minute }),
    (state: WorldState) => Reflect.deleteProperty(mochi(state), 'wish'),
    (state: WorldState) => Reflect.deleteProperty(mochi(state), 'lastWishDay'),
    // A target that is not there, of the wrong sort, or where the kind has none.
    (state: WorldState) => wish(pepper(state), 'FISH', 'SHARK'),
    (state: WorldState) => wish(pepper(state), 'FISH', 'COAST'),
    (state: WorldState) => wish(pepper(state), 'FISH', null),
    (state: WorldState) => wish(mochi(state), 'OUTING', 'RIVER'),
    (state: WorldState) => wish(mochi(state), 'OUTING', 'SILVER'),
    (state: WorldState) => wish(mochi(state), 'PETTING', 'COAST'),
    (state: WorldState) => wish(mochi(state), 'CAFE', 'building-2'),
    // Something the cat could not wish for: a fish of another breed, water not yet
    // open, a home it has, a cafe near home that is there.
    (state: WorldState) => wish(pepper(state), 'FISH', 'KOI'),
    (state: WorldState) => (state.fishing.xp = skillXp(4)),
    (state: WorldState) => wish(mochi(state), 'HOME', null),
    (state: WorldState) => (state.buildings[1]!.position = { x: 4, y: 4 }),
    // A day that has not come, or not after the last wish granted.
    (state: WorldState) => (mochi(state).wish!.sinceDay = TODAY + 1),
    (state: WorldState) => (mochi(state).lastWishDay = TODAY + 1),
    (state: WorldState) => (mochi(state).lastWishDay = TODAY),
    // A wish so old that the cat would have changed its mind already.
    (state: WorldState) => (pepper(state).wish!.sinceDay = OLDEST - 1),
    (state: WorldState) => (pepper(state).wish!.sinceDay = -1),
    (state: WorldState) => (pepper(state).wish!.sinceDay = 1.5),
  ])
    expect(tamper(change)).toThrow();
});
