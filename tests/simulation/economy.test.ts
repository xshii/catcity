import { describe, expect, it } from 'vitest';
import { CAT_BREED_IDS, type CatBreed } from '../../src/content/breeds';
import { CAT_DEFINITIONS, MAX_COMPANIONS } from '../../src/content/cats';
import {
  BUILDINGS,
  buildingPrice,
  CAFE,
  CITY_COSTS,
  CITY_START,
  CITY_TIME,
  landPrice,
} from '../../src/content/city';
import { ARRIVAL_MINUTES, MAX_RESIDENTS } from '../../src/content/residents';
import type { Position, World } from '../../src/core';
import { createWorld, loadWorld } from '../../src/core/world';
import {
  buildOn,
  CITY_PLAN,
  crowdedStart,
  customersServed,
  playCity,
  SALON_PLAN,
  type Layout,
} from '../helpers/city-player';
import { advance } from '../helpers/world';

/**
 * The economy's targets (spec 040) on the seed 42 map, for the full city of spec 041
 * T-31: the companion limit of cats and every resident, all of them customers. The
 * targets are the spec's: a number in content that misses one is changed there, never
 * the range here. Each holds for a new game with a stray of every breed (spec 041 T-14).
 */
const FISHING_COINS_PER_REAL_MINUTE = 25;
const FISHING_PER_REAL_HOUR = 60 * FISHING_COINS_PER_REAL_MINUTE;
const FASTEST = Math.max(...CITY_TIME.speeds);
const SLOWEST = Math.min(...CITY_TIME.speeds);
/** One real second passes `speed` game minutes: a real hour is 60 × speed game hours. */
const gameMinutesPerRealHour = (speed: number) => 60 * 60 * speed;
/** Everyone a full city seats: the companion limit and the resident limit. */
const CUSTOMERS = MAX_COMPANIONS + MAX_RESIDENTS;
/** The same plots with the cafes crowded together in the north. */
const CROWDED: Layout = {
  cafes: [
    { x: 4, y: 2 },
    { x: 6, y: 2 },
    { x: 4, y: 3 },
    { x: 6, y: 3 },
    { x: 4, y: 4 },
    { x: 6, y: 4 },
  ],
  lodges: [
    { x: 4, y: 7 },
    { x: 6, y: 7 },
    { x: 5, y: 8 },
    { x: 2, y: 6 },
  ],
};
const FUNDS = 1_000_000;
const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y;

/** A new game's stray: Mochi of `breed`, in its template's look. */
const strayOf = (breed: CatBreed) => ({
  breed,
  appearance: CAT_DEFINITIONS.MOCHI.appearance,
});

/** Every plot of the plan built, and what it cost; the residents are still to come. */
function builtCity(
  breed: CatBreed,
  layout: Layout = CITY_PLAN,
  plots: readonly Position[] = CITY_PLAN.plots,
) {
  const state = crowdedStart(strayOf(breed)).getSnapshot();
  const world = loadWorld(
    JSON.stringify({
      ...JSON.parse(createWorld(CITY_PLAN.seed).save()),
      world: { ...state, coins: FUNDS },
    }),
  );
  // Cafes first, so the apartments fill in the plan's order either way.
  for (const plot of layout.cafes) buildOn(world, plot, layout);
  for (const plot of plots)
    if (!layout.cafes.some((cafe) => same(cafe, plot)))
      buildOn(world, plot, layout);
  return { world, spent: FUNDS - world.getSnapshot().coins };
}

/** Game minutes until the last resident has come, one at each day's start. */
const untilResidents = (world: World) =>
  MAX_RESIDENTS * ARRIVAL_MINUTES - world.getSnapshot().minute;

/** The built city once every resident has come. */
function filledCity(breed: CatBreed, layout: Layout = CITY_PLAN) {
  const city = builtCity(breed, layout);
  expect(advance(city.world, untilResidents(city.world)).ok).toBe(true);
  expect(city.world.getSnapshot().residents).toHaveLength(MAX_RESIDENTS);
  return city;
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

describe.each(CAT_BREED_IDS)('a new game with a %s stray', (breed) => {
  describe('a full city: 10 companions and 16 residents, 5 apartments, 4 lodges, 6 cafes', () => {
    it('has every companion and every resident as a customer when the cafes are placed well', () => {
      const { world } = filledCity(breed);
      const state = world.getSnapshot();
      expect(state.cats).toHaveLength(MAX_COMPANIONS);
      expect(state.cats.every((cat) => cat.home)).toBe(true);
      expect(state.buildings.map((building) => building.type).sort()).toEqual([
        ...Array<string>(5).fill('CAT_APARTMENT'),
        ...Array<string>(6).fill('CAT_CAFE'),
        ...Array<string>(4).fill('CAT_LODGE'),
      ]);
      expect(CUSTOMERS).toBe(26);
      expect(customersServed(state)).toBe(CUSTOMERS);
      const interval = BUILDINGS.CAT_CAFE.intervalMinutes;
      expect(earned(world, interval)).toBe(CUSTOMERS * CAFE.coinsPerCustomer);
      expect(earned(world, 24 * 60)).toBe(
        ((24 * 60) / interval) * CUSTOMERS * CAFE.coinsPerCustomer,
      );
      // 208 coins per game day.
      expect(((24 * 60) / interval) * CUSTOMERS * CAFE.coinsPerCustomer).toBe(
        208,
      );
      expect(loadWorld(world.save()).save()).toBe(world.save());
    });

    it('earns less when the cafes crowd together, for the same bill', () => {
      const crowded = filledCity(breed, CROWDED);
      const served = customersServed(crowded.world.getSnapshot());
      expect(served).toBeGreaterThan(0);
      expect(served).toBeLessThan(CUSTOMERS);
      expect(crowded.spent).toBe(builtCity(breed).spent);
    });

    it('costs 42,970 coins to build, land and roads included', () => {
      const { spent } = builtCity(breed);
      const prices = (type: keyof typeof BUILDINGS, count: number) =>
        Array.from({ length: count }, (_, existing) =>
          buildingPrice(type, existing),
        ).reduce((sum, price) => sum + price, 0);
      // Seven plots and three roads on bought land; one plot is a tile further out.
      const land =
        6 * landPrice({ x: 4, y: 2 }) +
        landPrice({ x: 5, y: 8 }) +
        3 * (landPrice({ x: 5, y: 2 }) + CITY_COSTS.placeRoad);
      expect(land).toBe(615);
      expect(spent).toBe(
        prices('CAT_CAFE', 6) +
          prices('CAT_APARTMENT', 5) +
          prices('CAT_LODGE', 4) +
          land,
      );
      expect(spent).toBe(42_970);
      expect(spent).toBeGreaterThanOrEqual(40_000);
      expect(spent).toBeLessThanOrEqual(48_000);
    });

    it('A: idles through a real hour at 4× for at most 1.5 times what fishing pays', () => {
      expect(FASTEST).toBe(4);
      const idle = earned(
        filledCity(breed).world,
        gameMinutesPerRealHour(FASTEST),
      );
      expect(idle).toBe(2080);
      expect(idle).toBeLessThanOrEqual(1.5 * FISHING_PER_REAL_HOUR);
    });

    it('D: never earns more than fishing per real hour at 1×', () => {
      expect(SLOWEST).toBe(1);
      const idle = earned(
        filledCity(breed).world,
        gameMinutesPerRealHour(SLOWEST),
      );
      expect(idle).toBe(520);
      expect(idle).toBeLessThanOrEqual(FISHING_PER_REAL_HOUR);
    });
  });

  // The player who counts on the residents to come buys the most customers per coin
  // there is: the quickest to a full city, and so the one the lower bound is for.
  // 12 to 20 real hours is the 4× player's target only (用户 2026-09-30).
  describe('a player who fishes, keeps the clock at 4× and reinvests', () => {
    it('B: fills the city in 12 to 20 real hours', () => {
      const run = playCity({
        fishing: FISHING_COINS_PER_REAL_MINUTE,
        speed: FASTEST,
        realMinutes: 21 * 60,
        stray: strayOf(breed),
      });
      const state = run.world.getSnapshot();
      expect(state.buildings).toHaveLength(15);
      expect(state.cats.every((cat) => cat.home)).toBe(true);
      expect(state.residents).toHaveLength(MAX_RESIDENTS);
      expect(customersServed(state)).toBe(CUSTOMERS);
      expect(run.filledAt).toBe(912);
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

    it('B: fills it in 12 to 20 real hours too when lodges count only once residents come', () => {
      const run = playCity({
        fishing: FISHING_COINS_PER_REAL_MINUTE,
        speed: FASTEST,
        realMinutes: 21 * 60,
        stray: strayOf(breed),
        shortSighted: true,
      });
      expect(customersServed(run.world.getSnapshot())).toBe(CUSTOMERS);
      expect(run.filledAt).toBe(948);
      expect(run.filledAt! / 60).toBeGreaterThanOrEqual(12);
      expect(run.filledAt! / 60).toBeLessThanOrEqual(20);
    });

    it('plays the same way every time', () => {
      const play = () =>
        playCity({
          fishing: FISHING_COINS_PER_REAL_MINUTE,
          speed: FASTEST,
          realMinutes: 120,
          stray: strayOf(breed),
        });
      // Two plays, compared in both ways: a third play would only cost time.
      const first = play();
      const second = play();
      expect(second.purchases).toEqual(first.purchases);
      expect(second.world.save()).toBe(first.world.save());
    });
  });

  // B is the 4× player's; at 1× the cafes pay a quarter as much per real hour, so the
  // city fills later, and its cafes never out-earn the fishing that pays for it. At 1×
  // the target is no sooner than 12 real hours, with less from cafes than from fishing,
  // and no upper bound (用户 2026-09-30).
  describe('the same player at 1×', () => {
    it('fills the city no sooner than 12 real hours, fishing paying the most of it', () => {
      const run = playCity({
        fishing: FISHING_COINS_PER_REAL_MINUTE,
        speed: SLOWEST,
        realMinutes: 30 * 60,
        stray: strayOf(breed),
      });
      expect(customersServed(run.world.getSnapshot())).toBe(CUSTOMERS);
      expect(run.filledAt).toBe(1380);
      expect(run.filledAt! / 60).toBeGreaterThanOrEqual(12);
      expect(run.cafeIncome).toBeLessThan(
        run.filledAt! * FISHING_COINS_PER_REAL_MINUTE,
      );
    });
  });

  // The salon earns nothing (spec 041 T-15): its price may only slow the city down so
  // far that every target above still holds with it.
  describe('the cat salon', () => {
    it('fits in the full city for 44,650 coins in all, still within the range', () => {
      const { world, spent } = builtCity(breed, CITY_PLAN, SALON_PLAN.plots);
      buildOn(world, SALON_PLAN.salon);
      const total = FUNDS - world.getSnapshot().coins;
      // Its plan paves the south road on to (5,8) and builds on two plots beside it.
      expect(spent).toBe(
        42_970 + CITY_COSTS.placeRoad + landPrice(SALON_PLAN.road),
      );
      expect(total - spent).toBe(
        buildingPrice('CAT_SALON', 0) + landPrice(SALON_PLAN.salon),
      );
      expect(total).toBe(44_650);
      expect(total).toBeGreaterThanOrEqual(40_000);
      expect(total).toBeLessThanOrEqual(48_000);
      advance(world, untilResidents(world));
      const state = world.getSnapshot();
      expect(state.buildings).toHaveLength(16);
      expect(customersServed(state)).toBe(CUSTOMERS);
    });

    it('B: still fills the city in 12 to 20 real hours when the salon comes first', () => {
      const run = playCity({
        fishing: FISHING_COINS_PER_REAL_MINUTE,
        speed: FASTEST,
        realMinutes: 21 * 60,
        stray: strayOf(breed),
        salonFirst: true,
      });
      const state = run.world.getSnapshot();
      expect(state.buildings).toHaveLength(16);
      expect(customersServed(state)).toBe(CUSTOMERS);
      // The first hour of fishing buys it: the price is one real hour's fishing.
      expect(buildingPrice('CAT_SALON', 0)).toBe(FISHING_PER_REAL_HOUR);
      expect(run.purchases[0]).toMatchObject({
        realMinute: 31,
        building: 'CAT_SALON',
      });
      expect(run.filledAt).toBe(974);
      expect(run.filledAt! / 60).toBeGreaterThanOrEqual(12);
      expect(run.filledAt! / 60).toBeLessThanOrEqual(20);
    });
  });

  describe('the first cafe of a new game', () => {
    const firstCafe = () => {
      const world = createWorld(CITY_PLAN.seed, strayOf(breed));
      const must = (command: unknown) =>
        expect(world.dispatch(command).ok).toBe(true);
      must({
        type: 'BUILD_BUILDING',
        buildingType: 'CAT_APARTMENT',
        position: { x: 4, y: 4 },
      });
      const home = world.getSnapshot().buildings[0]!.id;
      must({ type: 'ASSIGN_HOME', catId: 'mochi', buildingId: home });
      must({
        type: 'BUILD_BUILDING',
        buildingType: 'CAT_CAFE',
        position: { x: 4, y: 3 },
      });
      // Pepper moves into the apartment's other bed.
      must({ type: 'INVITE_CAT', definitionId: 'PEPPER' });
      expect(world.getSnapshot().cats.map((cat) => cat.home)).toEqual([
        home,
        home,
      ]);
      // Both buildings and the invitation come out of the starting coins.
      expect(world.getSnapshot().coins).toBeGreaterThanOrEqual(0);
      return world;
    };

    it('C: pays for itself within 60 real minutes at 4×, with two cats next door', () => {
      const paid = earned(firstCafe(), gameMinutesPerRealHour(FASTEST));
      expect(paid).toBe(160);
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
});
