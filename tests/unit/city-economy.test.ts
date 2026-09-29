import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  buildingPrice,
  CAFE,
  CITY_START,
  LAND_PRICE,
  landPrice,
} from '../../src/content/city';
import type { Position } from '../../src/core';
import { cafeCustomers } from '../../src/core/city';
import { createWorld, loadWorld, type World } from '../../src/core/world';
import { advance, buildCafe } from '../helpers/world';

/** Game minutes between two payments of a cafe. */
const INTERVAL = BUILDINGS.CAT_CAFE.intervalMinutes;
const rich = (coins: number) => {
  const save = JSON.parse(createWorld(42).save());
  save.world.coins = coins;
  return loadWorld(JSON.stringify(save));
};
const buildHome = (world: World, position: Position) => {
  expect(
    world.dispatch({
      type: 'BUILD_BUILDING',
      buildingType: 'CAT_APARTMENT',
      position,
    }).ok,
  ).toBe(true);
  return world.getSnapshot().buildings.at(-1)!.id;
};
const moveIn = (world: World, catId: string, buildingId: string) =>
  expect(world.dispatch({ type: 'ASSIGN_HOME', catId, buildingId }).ok).toBe(
    true,
  );
/** A new cat on a free tile, living in the apartment. */
const resident = (world: World, position: Position, home: string) => {
  expect(world.dispatch({ type: 'DEBUG_SPAWN_CAT', position }).ok).toBe(true);
  moveIn(world, world.getSnapshot().cats.at(-1)!.id, home);
};
const customers = (world: World, cafeId: string) =>
  cafeCustomers(world.getSnapshot(), cafeId).map((cat) => cat.id);
const income = (world: World, minutes: number) => {
  const result = advance(world, minutes);
  if (!result.ok) throw new Error(result.error);
  return result.events.flatMap((event) =>
    event.type === 'IncomeGenerated' ? [[event.entityId, event.amount]] : [],
  );
};

describe('prices (spec 040)', () => {
  it('raises the price with every building of the type, to the nearest 5', () => {
    const prices = (type: 'CAT_CAFE' | 'CAT_APARTMENT', count: number) =>
      Array.from({ length: count }, (_, existing) =>
        buildingPrice(type, existing),
      );
    expect(prices('CAT_CAFE', 6)).toEqual([200, 400, 800, 1600, 3200, 6400]);
    // 300 × 1.8^n: 972 → 970, 1749.6 → 1750, 10203.1 → 10205, 18365.6 → 18365.
    expect(prices('CAT_APARTMENT', 8)).toEqual([
      300, 540, 970, 1750, 3150, 5670, 10205, 18365,
    ]);
    // Far beyond any city the price stays a growing multiple of 5.
    for (const type of ['CAT_CAFE', 'CAT_APARTMENT'] as const)
      for (let existing = 1; existing < 30; existing++) {
        const price = buildingPrice(type, existing);
        expect(price % 5).toBe(0);
        expect(price).toBeGreaterThan(buildingPrice(type, existing - 1));
      }
  });

  it('prices land by its distance outside the starter district', () => {
    const { min, max } = CITY_START.starterDistrict;
    // Sharing an edge with the district.
    expect(landPrice({ x: min - 1, y: min })).toBe(LAND_PRICE.base);
    expect(landPrice({ x: max, y: max + 1 })).toBe(LAND_PRICE.base);
    // Touching only its corner is one tile further along the grid.
    expect(landPrice({ x: min - 1, y: min - 1 })).toBe(
      LAND_PRICE.base + LAND_PRICE.perTile,
    );
    expect(landPrice({ x: max + 3, y: max })).toBe(
      LAND_PRICE.base + 2 * LAND_PRICE.perTile,
    );
    expect(landPrice({ x: 7, y: 9 })).toBe(125);
    expect(landPrice({ x: 9, y: 9 })).toBe(175);
  });

  it('charges the land price of the plot, and nothing when it is refused', () => {
    const world = createWorld(42);
    for (const position of [
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 7, y: 9 },
    ]) {
      const before = world.getSnapshot().coins;
      expect(world.dispatch({ type: 'BUY_LAND', position }).ok).toBe(true);
      expect(world.getSnapshot().coins).toBe(before - landPrice(position));
    }
    const poor = rich(landPrice({ x: 7, y: 9 }) - 1);
    const saved = poor.save();
    expect(
      poor.dispatch({ type: 'BUY_LAND', position: { x: 7, y: 9 } }),
    ).toEqual({ ok: false, error: 'INSUFFICIENT_COINS' });
    expect(poor.save()).toBe(saved);
    // The same coins still buy a plot next to the district.
    expect(
      poor.dispatch({ type: 'BUY_LAND', position: { x: 4, y: 2 } }).ok,
    ).toBe(true);
  });

  it('charges each building the price of its turn; moving stays free', () => {
    const world = rich(10_000);
    let coins = 10_000;
    const sites = [
      { x: 4, y: 4 },
      { x: 6, y: 4 },
      { x: 4, y: 6 },
    ];
    for (const [existing, position] of sites.entries()) {
      const result = buildCafe(world, position);
      coins -= buildingPrice('CAT_CAFE', existing);
      expect(result).toMatchObject({
        ok: true,
        events: [
          { type: 'BuildingBuilt', cost: buildingPrice('CAT_CAFE', existing) },
        ],
      });
      expect(world.getSnapshot().coins).toBe(coins);
    }
    // Cafes do not make apartments dearer.
    buildHome(world, { x: 6, y: 6 });
    coins -= buildingPrice('CAT_APARTMENT', 0);
    expect(world.getSnapshot().coins).toBe(coins);
    expect(
      world.dispatch({
        type: 'MOVE_BUILDING',
        buildingId: world.getSnapshot().buildings[0]!.id,
        position: { x: 4, y: 3 },
      }).ok,
    ).toBe(true);
    expect(world.getSnapshot().coins).toBe(coins);
  });

  it('refuses a building one coin short of its current price and changes nothing', () => {
    const second = buildingPrice('CAT_CAFE', 1);
    const world = rich(buildingPrice('CAT_CAFE', 0) + second - 1);
    expect(buildCafe(world, { x: 4, y: 4 }).ok).toBe(true);
    const saved = world.save();
    expect(buildCafe(world, { x: 6, y: 4 })).toEqual({
      ok: false,
      error: 'INSUFFICIENT_COINS',
    });
    expect(world.save()).toBe(saved);
    // The first price would have been affordable: the count decides, not the type.
    expect(world.getSnapshot().coins).toBeGreaterThanOrEqual(
      buildingPrice('CAT_CAFE', 0),
    );
  });
});

describe('cafe customers (spec 040)', () => {
  it('earns nothing without customers, and from a cat whose home is within range', () => {
    const world = createWorld(42);
    const home = buildHome(world, { x: 4, y: 4 });
    buildCafe(world, { x: 6, y: 6 });
    const cafe = world.getSnapshot().buildings[1]!.id;
    // A cat without a home is nobody's customer, however near it stands.
    expect(customers(world, cafe)).toEqual([]);
    moveIn(world, 'mochi', home);
    // Home and cafe are 4 tiles apart.
    expect(customers(world, cafe)).toEqual([]);
    const coins = world.getSnapshot().coins;
    expect(income(world, INTERVAL)).toEqual([]);
    expect(world.getSnapshot().coins).toBe(coins);
    // Moved within range, it earns on its own clock, not from the move.
    advance(world, 30);
    expect(
      world.dispatch({
        type: 'MOVE_BUILDING',
        buildingId: cafe,
        position: { x: 6, y: 3 },
      }).ok,
    ).toBe(true);
    expect(customers(world, cafe)).toEqual(['mochi']);
    expect(income(world, INTERVAL - 31)).toEqual([]);
    expect(income(world, 1)).toEqual([[cafe, CAFE.coinsPerCustomer]]);
    expect(world.getSnapshot().coins).toBe(coins + CAFE.coinsPerCustomer);
  });

  it('counts the home, not where the cat stands', () => {
    const world = createWorld(42);
    const home = buildHome(world, { x: 4, y: 4 });
    buildCafe(world, { x: 4, y: 3 });
    moveIn(world, 'mochi', home);
    const cafe = world.getSnapshot().buildings[1]!.id;
    expect(world.getSnapshot().cats[0]!.position).not.toEqual({ x: 4, y: 5 });
    expect(customers(world, cafe)).toEqual(['mochi']);
  });

  it('sends each cat to the nearest cafe only, the older one on a tie', () => {
    const world = rich(10_000);
    const home = buildHome(world, { x: 4, y: 4 });
    moveIn(world, 'mochi', home);
    buildCafe(world, { x: 6, y: 4 });
    buildCafe(world, { x: 4, y: 3 });
    buildCafe(world, { x: 3, y: 4 });
    const [, far, near, tied] = world
      .getSnapshot()
      .buildings.map((building) => building.id);
    expect(customers(world, far!)).toEqual([]);
    expect(customers(world, near!)).toEqual(['mochi']);
    expect(customers(world, tied!)).toEqual([]);
    expect(income(world, INTERVAL)).toEqual([[near, CAFE.coinsPerCustomer]]);
    // The older cafe keeps the cat wherever the buildings stand in the list.
    const save = JSON.parse(world.save());
    save.world.buildings.reverse();
    const reordered = loadWorld(JSON.stringify(save));
    expect(customers(reordered, near!)).toEqual(['mochi']);
    expect(customers(reordered, tied!)).toEqual([]);
  });

  it('serves at most five cats and pays for each of them', () => {
    const world = rich(10_000);
    buildCafe(world, { x: 4, y: 3 });
    const cafe = world.getSnapshot().buildings[0]!.id;
    const homes = [
      { x: 4, y: 4 },
      { x: 6, y: 4 },
      { x: 4, y: 6 },
    ].map((position) => buildHome(world, position));
    moveIn(world, 'mochi', homes[0]!);
    const spawn = [
      { x: 5, y: 3 },
      { x: 5, y: 4 },
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 3, y: 5 },
    ];
    for (const [index, position] of spawn.entries()) {
      resident(world, position, homes[Math.floor((index + 1) / 2)]!);
      expect(customers(world, cafe)).toHaveLength(
        Math.min(index + 2, CAFE.seats),
      );
    }
    expect(world.getSnapshot().cats).toHaveLength(6);
    expect(CAFE.seats).toBe(5);
    expect(income(world, INTERVAL)).toEqual([
      [cafe, CAFE.seats * CAFE.coinsPerCustomer],
    ]);
  });

  it('pays the same whether time passes at once or in pieces, and after a reload', () => {
    const build = () => {
      const world = createWorld(42);
      moveIn(world, 'mochi', buildHome(world, { x: 4, y: 4 }));
      advance(world, 25);
      buildCafe(world, { x: 4, y: 3 });
      return world;
    };
    const whole = build();
    advance(whole, 5 * INTERVAL + 7);
    let pieces = build();
    for (const minutes of [INTERVAL - 1, 1, 17, 3 * INTERVAL, INTERVAL - 10]) {
      advance(pieces, minutes);
      pieces = loadWorld(pieces.save());
    }
    expect(pieces.save()).toBe(whole.save());
    expect(whole.getSnapshot().coins).toBe(
      CITY_START.coins -
        buildingPrice('CAT_APARTMENT', 0) -
        buildingPrice('CAT_CAFE', 0) +
        5 * CAFE.coinsPerCustomer,
    );
  });
});
