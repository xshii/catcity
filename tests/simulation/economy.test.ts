import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  buildingPrice,
  CAFE,
  CITY_START,
  CITY_TIME,
} from '../../src/content/city';
import type { Position, World } from '../../src/core';
import { createWorld, loadWorld } from '../../src/core/world';
import {
  buildOn,
  CITY_PLAN,
  crowdedStart,
  customersServed,
  playCity,
} from '../helpers/city-player';
import { advance } from '../helpers/world';

/**
 * The economy's targets (spec 040), on the seed 42 map. The targets are the spec's:
 * a number in content that misses one is changed there, never the range here.
 */
const FISHING_COINS_PER_REAL_MINUTE = 25;
const FISHING_PER_REAL_HOUR = 60 * FISHING_COINS_PER_REAL_MINUTE;
const FASTEST = Math.max(...CITY_TIME.speeds);
/** One real second passes `speed` game minutes: a real hour is 60 × speed game hours. */
const gameMinutesPerRealHour = (speed: number) => 60 * 60 * speed;
/** The same plots with the cafes side by side in the north. */
const CROWDED: Position[] = [
  { x: 4, y: 2 },
  { x: 6, y: 2 },
  { x: 4, y: 3 },
  { x: 6, y: 3 },
];
const FUNDS = 1_000_000;

/** 16 cats in 8 apartments and 4 cafes, and what it cost to build. */
function filledCity(cafes: readonly Position[] = CITY_PLAN.cafes) {
  const state = crowdedStart().getSnapshot();
  const world = loadWorld(
    JSON.stringify({
      ...JSON.parse(createWorld(CITY_PLAN.seed).save()),
      world: { ...state, coins: FUNDS },
    }),
  );
  // Cafes first, so the apartments fill in the plan's order either way.
  for (const plot of cafes) buildOn(world, plot, cafes);
  for (const plot of CITY_PLAN.plots)
    if (!cafes.some((cafe) => cafe.x === plot.x && cafe.y === plot.y))
      buildOn(world, plot, cafes);
  return { world, spent: FUNDS - world.getSnapshot().coins };
}

/** Coins the cafes pay while the game minutes pass, from the income events. */
function earned(world: World, minutes: number) {
  let income = 0;
  // One command covers at most 30 game days.
  for (let left = minutes; left > 0; left -= 43_200) {
    const before = world.getSnapshot().coins;
    const result = advance(world, Math.min(left, 43_200));
    if (!result.ok) throw new Error(result.error);
    const paid = result.events.reduce(
      (sum, event) =>
        sum + (event.type === 'IncomeGenerated' ? event.amount : 0),
      0,
    );
    expect(world.getSnapshot().coins - before).toBe(paid);
    income += paid;
  }
  return income;
}

describe('a filled city: 16 cats, 8 apartments, 4 cafes', () => {
  it('has every cat as a customer when the cafes are placed well', () => {
    const { world } = filledCity();
    const state = world.getSnapshot();
    expect(state.cats).toHaveLength(16);
    expect(state.cats.every((cat) => cat.home)).toBe(true);
    expect(state.buildings.map((building) => building.type).sort()).toEqual([
      ...Array<string>(8).fill('CAT_APARTMENT'),
      ...Array<string>(4).fill('CAT_CAFE'),
    ]);
    expect(customersServed(state)).toBe(16);
    const interval = BUILDINGS.CAT_CAFE.intervalMinutes;
    expect(earned(world, interval)).toBe(16 * CAFE.coinsPerCustomer);
    expect(earned(world, 24 * 60)).toBe(
      ((24 * 60) / interval) * 16 * CAFE.coinsPerCustomer,
    );
    // 8 coins per game hour.
    expect((16 * CAFE.coinsPerCustomer * 60) / interval).toBe(8);
    expect(loadWorld(world.save()).save()).toBe(world.save());
  });

  it('earns less when the cafes crowd together, for the same bill', () => {
    const crowded = filledCity(CROWDED);
    const served = customersServed(crowded.world.getSnapshot());
    expect(served).toBeGreaterThan(0);
    expect(served).toBeLessThan(16);
    expect(crowded.spent).toBe(filledCity().spent);
  });

  it('costs 44,230 coins to build, land and roads included', () => {
    const { spent } = filledCity();
    expect(spent).toBe(44_230);
    expect(spent).toBeGreaterThanOrEqual(40_000);
    expect(spent).toBeLessThanOrEqual(48_000);
  });

  it('A: idles through a real hour at 4× for at most 1.5 times what fishing pays', () => {
    expect(FASTEST).toBe(4);
    const idle = earned(filledCity().world, gameMinutesPerRealHour(FASTEST));
    expect(idle).toBe(1920);
    expect(idle).toBeLessThanOrEqual(1.5 * FISHING_PER_REAL_HOUR);
  });

  it('D: never earns more than fishing per real hour at 1×', () => {
    const idle = earned(filledCity().world, gameMinutesPerRealHour(1));
    expect(idle).toBe(480);
    expect(idle).toBeLessThanOrEqual(FISHING_PER_REAL_HOUR);
  });
});

describe('a player who fishes, keeps the clock at 4× and reinvests', () => {
  it('B: fills the city in 12 to 20 real hours', () => {
    const run = playCity({
      fishing: FISHING_COINS_PER_REAL_MINUTE,
      speed: FASTEST,
      realMinutes: 21 * 60,
    });
    const state = run.world.getSnapshot();
    expect(state.buildings).toHaveLength(12);
    expect(state.cats.every((cat) => cat.home)).toBe(true);
    expect(customersServed(state)).toBe(16);
    expect(run.filledAt).toBe(901);
    expect(run.filledAt! / 60).toBeGreaterThanOrEqual(12);
    expect(run.filledAt! / 60).toBeLessThanOrEqual(20);
    // Every coin is accounted for: the start, fishing and the cafes paid for the city.
    expect(state.coins).toBe(
      CITY_START.coins +
        run.filledAt! * FISHING_COINS_PER_REAL_MINUTE +
        run.cafeIncome -
        run.purchases.reduce((sum, purchase) => sum + purchase.cost, 0),
    );
    // A home and a cafe beside it come first, out of the starting coins.
    expect(run.purchases.slice(0, 2)).toMatchObject([
      { realMinute: 0, building: 'CAT_APARTMENT' },
      { realMinute: 0, building: 'CAT_CAFE', customers: 2 },
    ]);
  });

  it('plays the same way every time', () => {
    const play = () =>
      playCity({
        fishing: FISHING_COINS_PER_REAL_MINUTE,
        speed: FASTEST,
        realMinutes: 120,
      });
    const first = play();
    expect(play().purchases).toEqual(first.purchases);
    expect(play().world.save()).toBe(first.world.save());
  });
});

describe('the first cafe of a new game', () => {
  const firstCafe = () => {
    const world = createWorld(CITY_PLAN.seed);
    const must = (command: unknown) =>
      expect(world.dispatch(command).ok).toBe(true);
    must({ type: 'INVITE_PEPPER' });
    must({
      type: 'BUILD_BUILDING',
      buildingType: 'CAT_APARTMENT',
      position: { x: 4, y: 4 },
    });
    const home = world.getSnapshot().buildings[0]!.id;
    for (const cat of world.getSnapshot().cats)
      must({ type: 'ASSIGN_HOME', catId: cat.id, buildingId: home });
    must({
      type: 'BUILD_BUILDING',
      buildingType: 'CAT_CAFE',
      position: { x: 4, y: 3 },
    });
    // Both buildings come out of the starting coins.
    expect(world.getSnapshot().coins).toBeGreaterThanOrEqual(0);
    return world;
  };

  it('C: pays for itself within 60 real minutes at 4×, with two cats next door', () => {
    const paid = earned(firstCafe(), gameMinutesPerRealHour(FASTEST));
    expect(paid).toBe(240);
    expect(paid).toBeGreaterThanOrEqual(buildingPrice('CAT_CAFE', 0));
  });

  it('C: pays its first income within 2 real minutes at 4×', () => {
    const world = firstCafe();
    expect(
      earned(world, (2 * gameMinutesPerRealHour(FASTEST)) / 60),
    ).toBeGreaterThan(0);
    expect(BUILDINGS.CAT_CAFE.intervalMinutes).toBeLessThanOrEqual(
      (2 * gameMinutesPerRealHour(FASTEST)) / 60,
    );
  });
});
