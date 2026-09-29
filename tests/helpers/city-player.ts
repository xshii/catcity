import { BUILDINGS, CAFE } from '../../src/content/city';
import { cafeCustomers } from '../../src/core/city';
import { createWorld, World } from '../../src/core/world';
import type { Position, WorldState } from '../../src/core';

/**
 * A full city on the seed 42 map (spec 040): 12 plots beside roads for 8 apartments and
 * 4 cafes. The starter district has 8 such plots; four more are bought, two of them
 * beside a road the player lays on a fifth bought plot.
 */
export const CITY_PLAN = {
  seed: 42,
  plots: [
    { x: 4, y: 3 },
    { x: 6, y: 3 },
    { x: 3, y: 4 },
    { x: 4, y: 4 },
    { x: 6, y: 4 },
    { x: 3, y: 6 },
    { x: 4, y: 6 },
    { x: 6, y: 6 },
    { x: 4, y: 2 },
    { x: 6, y: 2 },
    { x: 5, y: 7 },
    { x: 2, y: 5 },
  ],
  /** Bought and paved before the plots beside it can be built on. */
  road: { x: 5, y: 2 },
  /** Every apartment has one nearest cafe within range, and every cafe two apartments. */
  cafes: [
    { x: 6, y: 3 },
    { x: 6, y: 6 },
    { x: 4, y: 2 },
    { x: 2, y: 5 },
  ],
  cats: 16,
} as const;

const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y;
/** Grass away from the city for the cats to stand on; where they stand earns nothing. */
const STANDING: Position[] = [2, 3, 4, 5, 6, 7]
  .flatMap((x) => [7, 8, 9].map((y) => ({ x, y })))
  .filter((position) => !CITY_PLAN.plots.some((plot) => same(plot, position)));

const must = (world: World, command: unknown) => {
  const result = world.dispatch(command);
  if (!result.ok)
    throw new Error(`${result.error}: ${JSON.stringify(command)}`);
  return result.events;
};
const withCoins = (world: World, coins: number) =>
  new World({ ...world.getSnapshot(), coins });

/** A new game where all 16 cats already exist, none of them housed. */
export function crowdedStart(): World {
  const world = createWorld(CITY_PLAN.seed);
  for (const position of STANDING.slice(0, CITY_PLAN.cats - 1))
    must(world, { type: 'DEBUG_SPAWN_CAT', position });
  return world;
}

/** Coins all cafes pay together per payment interval: one share per customer. */
export const customersServed = (state: WorldState): number =>
  state.buildings
    .filter((building) => building.type === 'CAT_CAFE')
    .reduce((sum, cafe) => sum + cafeCustomers(state, cafe.id).length, 0);

/** Builds on the plot, with the land and road it needs; homeless cats move in at once. */
export function buildOn(
  world: World,
  plot: Position,
  cafes: readonly Position[] = CITY_PLAN.cafes,
): void {
  const tile = (position: Position) =>
    world
      .getSnapshot()
      .map.tiles.find((item) => same(item.position, position))!;
  const build = {
    type: 'BUILD_BUILDING',
    buildingType: cafes.some((cafe) => same(cafe, plot))
      ? 'CAT_CAFE'
      : 'CAT_APARTMENT',
    position: plot,
  };
  if (!tile(plot).owned) must(world, { type: 'BUY_LAND', position: plot });
  if (world.check(build).ok === false) {
    // Only the plots beside the planned road are away from the network.
    must(world, { type: 'BUY_LAND', position: CITY_PLAN.road });
    must(world, { type: 'PLACE_ROAD', position: CITY_PLAN.road });
  }
  must(world, build);
  const home = world.getSnapshot().buildings.at(-1)!;
  if (home.type !== 'CAT_APARTMENT') return;
  for (const cat of world
    .getSnapshot()
    .cats.filter((item) => !item.home)
    .slice(0, 2))
    must(world, { type: 'ASSIGN_HOME', catId: cat.id, buildingId: home.id });
}

const FUNDS = 100_000_000;
/** One ADVANCE_TIME command covers at most 30 game days. */
const MAX_ADVANCE = 30 * 24 * 60;
/** What building on the plot would cost now and how many customers it would add. */
function appraise(world: World, plot: Position, cafes: readonly Position[]) {
  const trial = withCoins(world, FUNDS);
  const before = customersServed(trial.getSnapshot());
  buildOn(trial, plot, cafes);
  const after = trial.getSnapshot();
  return {
    plot,
    cafe: cafes.some((cafe) => same(cafe, plot)),
    cost: FUNDS - after.coins,
    gain: customersServed(after) - before,
  };
}

/**
 * The next most useful purchase: the most new customers per coin; while nothing adds
 * customers, the cheapest apartment, so cats have homes. Ties go to the plan's order.
 */
function nextPurchase(world: World, cafes: readonly Position[]) {
  const built = world.getSnapshot().buildings;
  const open = CITY_PLAN.plots
    .filter((plot) => !built.some((item) => same(item.position, plot)))
    .map((plot) => appraise(world, plot, cafes));
  const earning = open
    .filter((item) => item.gain > 0)
    .sort((a, b) => b.gain * a.cost - a.gain * b.cost)[0];
  return (
    earning ??
    open.filter((item) => !item.cafe).sort((a, b) => a.cost - b.cost)[0] ??
    open[0]
  );
}

interface Purchase {
  realMinute: number;
  building: 'CAT_CAFE' | 'CAT_APARTMENT';
  cost: number;
  customers: number;
}

/**
 * A player who fishes the whole time, keeps the city clock at `speed` and reinvests:
 * every real minute pays `fishing` coins and passes 60 × speed game minutes; the next
 * most useful purchase is made as soon as it is affordable. Purchases, homes and time
 * are Core commands; only the fishing coins are credited from outside.
 */
export function playCity(options: {
  fishing: number;
  speed: number;
  realMinutes: number;
}) {
  const minutesPerRealMinute = 60 * options.speed;
  let world = crowdedStart();
  const purchases: Purchase[] = [];
  let cafeIncome = 0;
  let realMinute = 0;
  while (realMinute <= options.realMinutes) {
    const next = nextPurchase(world, CITY_PLAN.cafes);
    if (!next) return { world, purchases, filledAt: realMinute, cafeIncome };
    const state = world.getSnapshot();
    if (next.cost <= state.coins) {
      buildOn(world, next.plot);
      purchases.push({
        realMinute,
        building: next.cafe ? 'CAT_CAFE' : 'CAT_APARTMENT',
        cost: next.cost,
        customers: customersServed(world.getSnapshot()),
      });
      continue;
    }
    // Wait as many whole real minutes as cannot yet pay for it, at least one: a real
    // minute never pays more than every customer at every payment that may fall in it.
    const most =
      options.fishing +
      customersServed(state) *
        CAFE.coinsPerCustomer *
        Math.ceil(minutesPerRealMinute / BUILDINGS.CAT_CAFE.intervalMinutes);
    const wait = Math.min(
      Math.max(1, Math.floor((next.cost - state.coins) / most)),
      Math.floor(MAX_ADVANCE / minutesPerRealMinute),
    );
    const events = must(world, {
      type: 'ADVANCE_TIME',
      minutes: wait * minutesPerRealMinute,
    });
    for (const event of events)
      if (event.type === 'IncomeGenerated') cafeIncome += event.amount;
    world = withCoins(
      world,
      world.getSnapshot().coins + wait * options.fishing,
    );
    realMinute += wait;
  }
  return { world, purchases, filledAt: null, cafeIncome };
}
