import { describe, expect, it } from 'vitest';
import {
  CAT_DEFINITIONS,
  CAT_DEFINITION_IDS,
  INVITABLE_CATS,
  MAX_COMPANIONS,
  invitePrice,
} from '../../src/content/cats';
import { BUILDINGS } from '../../src/content/city';
import { SPOTS, SPOT_IDS, type FishId } from '../../src/content/fishing';
import { createWorld, World, type Position } from '../../src/core';
import { T13_COATS } from '../helpers/cat-shapes';
import { instantiateCat } from '../../src/core/cats';
import { gridDistance } from '../../src/core/city';
import { isWalkable } from '../../src/core/city/path';
import { MAX_CATS } from '../../src/core/limits';

// Spec 041 R-12, R-13 (design 4): the first-generation cats and how one is invited.

const invite = (world: World, definitionId: string) =>
  world.dispatch({ type: 'INVITE_CAT', definitionId });
const apartment = (world: World, position: Position) =>
  expect(
    world.dispatch({
      type: 'BUILD_BUILDING',
      buildingType: 'CAT_APARTMENT',
      position,
    }).ok,
  ).toBe(true);
/** Seed 42's starter district: plots beside a road, by row then column. */
const PLOTS = [
  { x: 4, y: 3 },
  { x: 6, y: 3 },
  { x: 3, y: 4 },
  { x: 4, y: 4 },
] as const;
/** A new game with an apartment of two free beds and coins to spare. */
const withBeds = (apartments = 1, coins = 100_000) => {
  const world = new World({ ...createWorld(42).getSnapshot(), coins: 5000 });
  for (const plot of PLOTS.slice(0, apartments)) apartment(world, plot);
  return new World({ ...world.getSnapshot(), coins });
};
/** The waterways where a fish lives. */
const waterways = (fish: FishId) =>
  SPOT_IDS.filter((spot) => SPOTS[spot].fish.includes(fish));

describe('the first-generation cats (R-12)', () => {
  it('are six, three of each sex, and every one but Mochi can be invited', () => {
    expect(CAT_DEFINITION_IDS).toHaveLength(6);
    const sexes = CAT_DEFINITION_IDS.map((id) => CAT_DEFINITIONS[id].sex);
    expect(sexes.filter((sex) => sex === 'F')).toHaveLength(3);
    expect(sexes.filter((sex) => sex === 'M')).toHaveLength(3);
    expect(INVITABLE_CATS).toEqual(
      CAT_DEFINITION_IDS.filter((id) => id !== 'MOCHI'),
    );
    // Ten, not eight (user 2026-09-30): a fifth generation needs nine cats.
    expect(MAX_COMPANIONS).toBe(10);
    expect(MAX_COMPANIONS).toBeLessThanOrEqual(MAX_CATS);
  });

  it('the four newcomers have names and personalities in Chinese, each their own', () => {
    const newcomers = INVITABLE_CATS.filter((id) => id !== 'PEPPER');
    expect(newcomers).toHaveLength(4);
    const names = CAT_DEFINITION_IDS.map((id) => CAT_DEFINITIONS[id].name);
    expect(new Set(names).size).toBe(names.length);
    const labels = CAT_DEFINITION_IDS.map(
      (id) => CAT_DEFINITIONS[id].personalityLabel,
    );
    expect(new Set(labels).size).toBe(labels.length);
    for (const id of newcomers) {
      expect(CAT_DEFINITIONS[id].name).toMatch(/^[一-鿿]{1,12}$/);
      expect(CAT_DEFINITIONS[id].personalityLabel).toMatch(
        /^[一-鿿]+( · [一-鿿]+)+$/,
      );
      expect(CAT_DEFINITIONS[id].unique).toBe(true);
    }
    expect(newcomers.map((id) => CAT_DEFINITIONS[id].sex).sort()).toEqual([
      'F',
      'F',
      'M',
      'M',
    ]);
  });

  it('each newcomer likes fish of more than one waterway, none that Mochi or Pepper likes', () => {
    const taken = new Set<FishId>([
      ...CAT_DEFINITIONS.MOCHI.favoriteFish,
      ...CAT_DEFINITIONS.PEPPER.favoriteFish,
    ]);
    const lists = new Set<string>();
    for (const id of INVITABLE_CATS.filter((id) => id !== 'PEPPER')) {
      const fish = CAT_DEFINITIONS[id].favoriteFish;
      for (const species of fish) expect(taken.has(species)).toBe(false);
      expect(new Set(fish.flatMap(waterways)).size).toBeGreaterThan(1);
      lists.add([...fish].sort().join());
    }
    expect(lists.size).toBe(4);
  });

  it('each looks like no other: its own look and breed, T-13’s four coats all worn (R-15)', () => {
    const looks = CAT_DEFINITION_IDS.map((id) =>
      JSON.stringify([
        CAT_DEFINITIONS[id].appearance,
        CAT_DEFINITIONS[id].breedId,
      ]),
    );
    expect(new Set(looks).size).toBe(looks.length);
    expect(
      new Set(
        CAT_DEFINITION_IDS.map((id) =>
          JSON.stringify(CAT_DEFINITIONS[id].appearance),
        ),
      ),
    ).toEqual(
      new Set(Object.values(T13_COATS).map((look) => JSON.stringify(look))),
    );
  });
});

describe('INVITE_CAT (R-12, R-13)', () => {
  it('moves the cat into the free bed, charges the price and keeps its template', () => {
    const world = withBeds();
    const before = world.getSnapshot();
    const home = before.buildings[0]!;
    const result = invite(world, 'PEPPER');
    expect(result.ok).toBe(true);
    const after = world.getSnapshot();
    const pepper = after.cats[1]!;
    expect(after.coins).toBe(before.coins - invitePrice(0));
    expect(pepper.home).toBe(home.id);
    expect(pepper).toEqual({
      ...instantiateCat('PEPPER', `cat-${before.nextId}`, pepper.position),
      home: home.id,
    });
    expect(after.nextId).toBe(before.nextId + 1);
    expect(result.ok && result.events).toEqual([
      {
        type: 'CatInvited',
        minute: before.minute,
        entityId: pepper.id,
        cost: invitePrice(0),
      },
    ]);
  });

  it('prices each invitation at twice the one before, from 200', () => {
    expect([0, 1, 2, 3, 4].map(invitePrice)).toEqual([
      200, 400, 800, 1600, 3200,
    ]);
    // Three apartments give the five beds the five invitations need.
    const world = withBeds(3);
    const paid: number[] = [];
    for (const id of INVITABLE_CATS) {
      const coins = world.getSnapshot().coins;
      expect(invite(world, id).ok).toBe(true);
      paid.push(coins - world.getSnapshot().coins);
    }
    expect(paid).toEqual([200, 400, 800, 1600, 3200]);
  });

  it('prices by the cats invited: Mochi and her debug copies do not count', () => {
    const world = withBeds();
    expect(
      world.dispatch({ type: 'DEBUG_SPAWN_CAT', position: { x: 3, y: 3 } }).ok,
    ).toBe(true);
    const coins = world.getSnapshot().coins;
    expect(invite(world, 'DOUBAO').ok).toBe(true);
    expect(world.getSnapshot().coins).toBe(coins - invitePrice(0));
  });

  it('fills the beds of the oldest apartment first', () => {
    const world = withBeds(2);
    const [first, second] = world.getSnapshot().buildings;
    const homes = () => world.getSnapshot().cats.map((cat) => cat.home);
    expect(
      world.dispatch({
        type: 'ASSIGN_HOME',
        catId: 'mochi',
        buildingId: first!.id,
      }).ok,
    ).toBe(true);
    expect(invite(world, 'PEPPER').ok).toBe(true);
    expect(invite(world, 'NIANGAO').ok).toBe(true);
    expect(homes()).toEqual([first!.id, first!.id, second!.id]);
  });

  it('puts the newcomer on the walkable tile nearest its home, ties by row then column', () => {
    for (const seed of [0, 1, 42, 99]) {
      const world = createWorld(seed);
      apartment(world, PLOTS[0]);
      const again = new World(world.getSnapshot());
      expect(invite(world, 'PEPPER').ok).toBe(true);
      const state = world.getSnapshot();
      const home = state.buildings[0]!.position;
      const cat = state.cats[1]!;
      const distance = (position: Position) => gridDistance(position, home);
      const before = (a: Position, b: Position) =>
        distance(a) < distance(b) ||
        (distance(a) === distance(b) &&
          (a.y < b.y || (a.y === b.y && a.x < b.x)));
      const earlier = state.map.tiles.filter(
        (tile) =>
          isWalkable(state, tile.position) &&
          before(tile.position, cat.position),
      );
      expect(earlier).toEqual([]);
      // The same world invites to the same tile.
      expect(invite(again, 'PEPPER').ok).toBe(true);
      expect(again.getSnapshot()).toEqual(state);
    }
  });
});

describe('INVITE_CAT rejections leave the world unchanged', () => {
  const rejects = (world: World, definitionId: string, error: string): void => {
    const before = world.save();
    expect(invite(world, definitionId)).toEqual({ ok: false, error });
    expect(world.save()).toBe(before);
  };

  it('a cat already in the city', () => {
    const world = withBeds();
    expect(invite(world, 'PEPPER').ok).toBe(true);
    rejects(world, 'PEPPER', 'ALREADY_INVITED');
    rejects(world, 'MOCHI', 'ALREADY_INVITED');
  });

  it('at the companion limit: the tenth cat comes, the eleventh does not', () => {
    const world = withBeds(2);
    // Grass south of the city, clear of the starter district.
    const grass = [2, 3, 4, 5, 6, 7].flatMap((x) => [
      { x, y: 7 },
      { x, y: 8 },
    ]);
    for (const position of grass.slice(0, MAX_COMPANIONS - 2))
      expect(world.dispatch({ type: 'DEBUG_SPAWN_CAT', position }).ok).toBe(
        true,
      );
    expect(invite(world, 'PEPPER').ok).toBe(true);
    expect(world.getSnapshot().cats).toHaveLength(MAX_COMPANIONS);
    rejects(world, 'NIANGAO', 'COMPANION_LIMIT');
  });

  it('without a free bed: no apartment, a full one, or only a cafe', () => {
    rejects(createWorld(42), 'PEPPER', 'NO_BED');
    const full = withBeds();
    const home = full.getSnapshot().buildings[0]!.id;
    for (const position of [
      { x: 3, y: 3 },
      { x: 2, y: 3 },
    ])
      expect(full.dispatch({ type: 'DEBUG_SPAWN_CAT', position }).ok).toBe(
        true,
      );
    for (const cat of full.getSnapshot().cats.slice(1))
      expect(
        full.dispatch({ type: 'ASSIGN_HOME', catId: cat.id, buildingId: home })
          .ok,
      ).toBe(true);
    expect(
      full.getSnapshot().cats.filter((cat) => cat.home === home),
    ).toHaveLength(BUILDINGS.CAT_APARTMENT.homeCapacity);
    rejects(full, 'PEPPER', 'NO_BED');
    const cafe = createWorld(42);
    expect(
      cafe.dispatch({
        type: 'BUILD_BUILDING',
        buildingType: 'CAT_CAFE',
        position: PLOTS[0],
      }).ok,
    ).toBe(true);
    rejects(cafe, 'PEPPER', 'NO_BED');
  });

  it('short of coins', () => {
    rejects(withBeds(1, invitePrice(0) - 1), 'PEPPER', 'INSUFFICIENT_COINS');
    const exact = withBeds(1, invitePrice(0));
    expect(invite(exact, 'PEPPER').ok).toBe(true);
    expect(exact.getSnapshot().coins).toBe(0);
  });

  it('a template that does not exist', () => {
    rejects(withBeds(), 'GARFIELD', 'INVALID_COMMAND');
  });
});
