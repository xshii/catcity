import { expect, it } from 'vitest';
import { BOND } from '../../src/content/care';
import { INVITABLE_CATS } from '../../src/content/cats';
import { MAX_RESIDENTS } from '../../src/content/residents';
import { createWorld, freeBeds, World } from '../../src/core';
import type { CatEntity, WorldState } from '../../src/core';
import { applyCommand } from '../../src/core/reducer';

// N-1 (spec 041, C1): the care a city asks for does not grow with its cats. A wish
// nobody grants takes nothing: no mood, no bond, no coins, nothing (R-52).

const DAY = BOND.dayMinutes;
/** Seed 42's starter plots beside its roads: four apartments and four lodges. */
const APARTMENTS = [
  { x: 4, y: 3 },
  { x: 6, y: 3 },
  { x: 3, y: 4 },
  { x: 4, y: 4 },
];
const LODGES = [
  { x: 6, y: 4 },
  { x: 3, y: 6 },
  { x: 4, y: 6 },
  { x: 6, y: 6 },
];

/** Eight companions, each at home, and sixteen residents, built by commands on seed 42. */
function crowdedCity(): WorldState {
  const world = new World({
    ...createWorld(42).getSnapshot(),
    coins: 1_000_000,
  });
  const must = (command: unknown) => {
    const result = world.dispatch(command);
    if (!result.ok) throw new Error(result.error);
  };
  for (const position of APARTMENTS)
    must({ type: 'BUILD_BUILDING', buildingType: 'CAT_APARTMENT', position });
  for (const position of LODGES)
    must({ type: 'BUILD_BUILDING', buildingType: 'CAT_LODGE', position });
  for (const definitionId of INVITABLE_CATS)
    must({ type: 'INVITE_CAT', definitionId });
  for (const position of [
    { x: 2, y: 7 },
    { x: 2, y: 8 },
  ])
    must({ type: 'DEBUG_SPAWN_CAT', position });
  for (const cat of world.getSnapshot().cats)
    if (!cat.home)
      must({
        type: 'ASSIGN_HOME',
        catId: cat.id,
        buildingId: freeBeds(world.getSnapshot())[0]!.id,
      });
  must({ type: 'ADVANCE_TIME', minutes: MAX_RESIDENTS * DAY });
  return world.getSnapshot();
}

/** A cat with its wish fields cleared: all else a wish could have changed in it. */
const withoutWishes = (cat: CatEntity) => ({
  ...cat,
  wish: null,
  lastWishDay: null,
});

it('N-1: a month of wishes nobody grants in a full city leaves every mood as it would be, none below 50', () => {
  const wishing = crowdedCity();
  expect(wishing.cats).toHaveLength(8);
  expect(wishing.cats.every((cat) => cat.home)).toBe(true);
  expect(wishing.residents).toHaveLength(MAX_RESIDENTS);
  // The same city where no cat ever thinks of a wish: each had its last one granted on a
  // day yet to come, which no command can do.
  const control = structuredClone(wishing);
  for (const cat of control.cats) {
    cat.wish = null;
    cat.lastWishDay = Number.MAX_SAFE_INTEGER;
  }
  let lowest = 100;
  for (let hour = 0; hour < 30 * 24; hour++) {
    applyCommand(wishing, { type: 'ADVANCE_TIME', minutes: 60 });
    applyCommand(control, { type: 'ADVANCE_TIME', minutes: 60 });
    const moods = wishing.cats.map((cat) => cat.mood);
    expect(moods).toEqual(control.cats.map((cat) => cat.mood));
    lowest = Math.min(lowest, ...moods);
  }
  expect(lowest).toBeGreaterThanOrEqual(50);
  // Most cats wished all month long; apart from the wishes, the cities are the same.
  expect(wishing.cats.filter((cat) => cat.wish).length).toBeGreaterThan(4);
  expect({ ...wishing, cats: wishing.cats.map(withoutWishes) }).toEqual({
    ...control,
    cats: control.cats.map(withoutWishes),
  });
  expect(() => new World(wishing)).not.toThrow();
});
