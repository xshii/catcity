import { MAX_COMPANIONS } from '../../src/content/cats';
import { BUILDINGS, CAFE } from '../../src/content/city';
import { MAX_RESIDENTS } from '../../src/content/residents';
import { nextResidentHome } from '../../src/core';
import {
  cafeAssignment,
  gridDistance,
  touchesNetwork,
} from '../../src/core/city';
import { createWorld, World, type Stray } from '../../src/core/world';
import type { Position, WorldState } from '../../src/core';

/** Which plots of a plan are cafes and which lodges; every other plot is an apartment. */
export interface Layout {
  cafes: readonly Position[];
  lodges: readonly Position[];
}

/**
 * A full city on the seed 42 map (spec 040; spec 041 T-31): the companion limit of cats
 * in 5 apartments, 16 residents in 4 lodges and 6 cafes, 30 seats for 26 customers. The
 * starter district has 8 plots beside its roads; seven more are bought beside three
 * roads the player lays on bought plots, north, south and west of it.
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
    { x: 4, y: 7 },
    { x: 6, y: 7 },
    { x: 5, y: 8 },
    { x: 2, y: 4 },
    { x: 2, y: 6 },
  ],
  /** Bought and paved before the plots beside them can be built on. */
  roads: [
    { x: 5, y: 2 },
    { x: 5, y: 7 },
    { x: 2, y: 5 },
  ],
  /**
   * Every home is a tile from a cafe, and every one of the 26 customers finds a seat
   * whatever the order the homes are built and filled in.
   */
  cafes: [
    { x: 6, y: 3 },
    { x: 3, y: 4 },
    { x: 4, y: 2 },
    { x: 4, y: 7 },
    { x: 6, y: 7 },
    { x: 2, y: 6 },
  ],
  lodges: [
    { x: 4, y: 3 },
    { x: 3, y: 6 },
    { x: 4, y: 6 },
    { x: 6, y: 6 },
  ],
  companions: MAX_COMPANIONS,
} as const;

const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y;
/**
 * The same city with room for the salon too (spec 041 T-15). The plan leaves no plot
 * beside its roads free, so the south road goes on to (5,8): the apartment planned there
 * moves to (6,8) beside it, and the salon stands across the road at (4,8).
 */
export const SALON_PLAN = {
  plots: CITY_PLAN.plots.map((plot) =>
    same(plot, { x: 5, y: 8 }) ? { x: 6, y: 8 } : plot,
  ),
  road: { x: 5, y: 8 },
  salon: { x: 4, y: 8 },
} as const;
const ROADS: readonly Position[] = [...CITY_PLAN.roads, SALON_PLAN.road];
/** Grass away from the city for the cats to stand on; where they stand earns nothing. */
const STANDING: Position[] = [2, 3, 4, 5, 6, 7]
  .flatMap((x) => [7, 8, 9].map((y) => ({ x, y })))
  .filter(
    (position) =>
      ![
        ...CITY_PLAN.plots,
        ...SALON_PLAN.plots,
        ...ROADS,
        SALON_PLAN.salon,
      ].some((plot) => same(plot, position)),
  );

const must = (world: World, command: unknown) => {
  const result = world.dispatch(command);
  if (!result.ok)
    throw new Error(`${result.error}: ${JSON.stringify(command)}`);
  return result.events;
};
const withCoins = (world: World, coins: number) =>
  new World({ ...world.getSnapshot(), coins });

/** A new game where every companion already exists, none of them housed; Mochi is `stray`. */
export function crowdedStart(stray?: Stray): World {
  const world = createWorld(CITY_PLAN.seed, stray);
  for (const position of STANDING.slice(0, CITY_PLAN.companions - 1))
    must(world, { type: 'DEBUG_SPAWN_CAT', position });
  return world;
}

/** Companions and residents seated in the city's cafes: each pays one share per payment. */
export const customersServed = (state: WorldState): number =>
  [...cafeAssignment(state).values()].reduce(
    (sum, customers) => sum + customers.length,
    0,
  );

/**
 * Customers once every lodge standing is full. Residents come by themselves, one a day
 * (spec 041 R-41), and sit after everyone already seated, so the count only grows as
 * they come: a player can count on them before they do.
 */
function customersExpected(state: WorldState): number {
  const residents = [...state.residents];
  const future = { ...state, residents };
  for (
    let home = nextResidentHome(future);
    home;
    home = nextResidentHome(future)
  )
    residents.push({
      id: `resident-${residents.length + 1}`,
      home: home.id,
      arrivedMinute: state.minute,
    });
  return customersServed(future);
}

type Building = 'CAT_CAFE' | 'CAT_APARTMENT' | 'CAT_LODGE' | 'CAT_SALON';
/** What the plans build on the plot: the salon on its own, cafes and lodges on theirs. */
const buildingOn = (plot: Position, layout: Layout): Building =>
  same(plot, SALON_PLAN.salon)
    ? 'CAT_SALON'
    : layout.cafes.some((cafe) => same(cafe, plot))
      ? 'CAT_CAFE'
      : layout.lodges.some((lodge) => same(lodge, plot))
        ? 'CAT_LODGE'
        : 'CAT_APARTMENT';

const tileOf = (world: World, position: Position) =>
  world.getSnapshot().map.tiles.find((item) => same(item.position, position))!;
/** Buys and paves the planned roads between the position and the network. */
function connect(world: World, position: Position): void {
  if (touchesNetwork(world.getSnapshot(), position)) return;
  const road = ROADS.find((item) => gridDistance(item, position) === 1)!;
  connect(world, road);
  if (!tileOf(world, road).owned)
    must(world, { type: 'BUY_LAND', position: road });
  must(world, { type: 'PLACE_ROAD', position: road });
}

/**
 * Builds on the plot, with the land and roads it needs; homeless companions move into an
 * apartment at once, residents come to a lodge by themselves.
 */
export function buildOn(
  world: World,
  plot: Position,
  layout: Layout = CITY_PLAN,
): void {
  if (!tileOf(world, plot).owned)
    must(world, { type: 'BUY_LAND', position: plot });
  connect(world, plot);
  must(world, {
    type: 'BUILD_BUILDING',
    buildingType: buildingOn(plot, layout),
    position: plot,
  });
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
/**
 * What building on the plot would cost now and how many customers it would add: counted
 * with the residents still to come, or `shortSighted` only with those seated now.
 */
function appraise(world: World, plot: Position, shortSighted: boolean) {
  const count = shortSighted ? customersServed : customersExpected;
  const trial = withCoins(world, FUNDS);
  const before = count(trial.getSnapshot());
  buildOn(trial, plot);
  const after = trial.getSnapshot();
  return {
    plot,
    building: buildingOn(plot, CITY_PLAN),
    cost: FUNDS - after.coins,
    gain: count(after) - before,
  };
}

/**
 * The next most useful purchase: the most new customers per coin; while nothing adds
 * customers, the cheapest apartment, so cats have homes. Ties go to the plan's order.
 */
function nextPurchase(
  world: World,
  plots: readonly Position[],
  shortSighted: boolean,
) {
  const built = world.getSnapshot().buildings;
  const open = plots
    .filter((plot) => !built.some((item) => same(item.position, plot)))
    .map((plot) => appraise(world, plot, shortSighted));
  const earning = open
    .filter((item) => item.gain > 0)
    .sort((a, b) => b.gain * a.cost - a.gain * b.cost)[0];
  return (
    earning ??
    open
      .filter((item) => item.building === 'CAT_APARTMENT')
      .sort((a, b) => a.cost - b.cost)[0] ??
    open[0]
  );
}

interface Purchase {
  realMinute: number;
  building: Building;
  cost: number;
  /** Customers seated just after the purchase. */
  customers: number;
}

/**
 * A player who fishes the whole time, keeps the city clock at `speed` and reinvests:
 * every real minute pays `fishing` coins and passes 60 × speed game minutes; the next
 * most useful purchase is made as soon as it is affordable. The city is full once every
 * plot is built and every lodge full. Purchases, homes and time are Core commands; only
 * the fishing coins are credited from outside.
 */
export function playCity(options: {
  fishing: number;
  speed: number;
  realMinutes: number;
  /** The new game's stray (spec 041 T-14); Mochi's template without one. */
  stray?: Stray;
  /**
   * Builds the salon before anything else, on the salon plan (spec 041 T-15): the
   * player it slows down the most, since every coin spent waits longest to earn.
   */
  salonFirst?: boolean;
  /** Values a lodge only by the residents already in it, not by those to come. */
  shortSighted?: boolean;
}) {
  const plots = options.salonFirst ? SALON_PLAN.plots : CITY_PLAN.plots;
  const shortSighted = options.shortSighted ?? false;
  const minutesPerRealMinute = 60 * options.speed;
  let world = crowdedStart(options.stray);
  const purchases: Purchase[] = [];
  let cafeIncome = 0;
  let realMinute = 0;
  // What to buy next depends on what stands, not on coins or the clock: appraised once
  // per purchase and kept while the player saves up for it.
  let next = options.salonFirst
    ? appraise(world, SALON_PLAN.salon, shortSighted)
    : nextPurchase(world, plots, shortSighted);
  while (realMinute <= options.realMinutes) {
    const state = world.getSnapshot();
    if (!next && state.residents.length === MAX_RESIDENTS)
      return { world, purchases, filledAt: realMinute, cafeIncome };
    if (next && next.cost <= state.coins) {
      buildOn(world, next.plot);
      purchases.push({
        realMinute,
        building: next.building,
        cost: next.cost,
        customers: customersServed(world.getSnapshot()),
      });
      next = nextPurchase(world, plots, shortSighted);
      continue;
    }
    // Wait as many whole real minutes as cannot yet pay for it, at least one: a real
    // minute never pays more than every customer to come at every payment in it.
    const most =
      options.fishing +
      customersExpected(state) *
        CAFE.coinsPerCustomer *
        Math.ceil(minutesPerRealMinute / BUILDINGS.CAT_CAFE.intervalMinutes);
    const wait = Math.min(
      next ? Math.max(1, Math.floor((next.cost - state.coins) / most)) : 1,
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
