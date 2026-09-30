export const BUILDING_IDS = [
  'CAT_CAFE',
  'CAT_APARTMENT',
  'CAT_LODGE',
  'CAT_SALON',
] as const;
/** `growth` is the price ratio from one building of a type to the next, as a fraction. */
export const BUILDINGS = {
  CAT_CAFE: {
    type: 'CAT_CAFE',
    name: '猫咖',
    basePrice: 200,
    growth: [2, 1],
    /** Every cafe is paid when the game clock reaches a multiple of this many minutes. */
    intervalMinutes: 120,
    homeCapacity: 0,
  },
  CAT_APARTMENT: {
    type: 'CAT_APARTMENT',
    name: '猫公寓',
    basePrice: 300,
    growth: [9, 5],
    homeCapacity: 2,
  },
  /** Residents live here, never companions (spec 041 R-40); T-31 sets the price by simulation. */
  CAT_LODGE: {
    type: 'CAT_LODGE',
    name: '居民楼',
    basePrice: 250,
    growth: [8, 5],
    homeCapacity: 0,
    residentCapacity: 4,
  },
  /** Restyles a companion's look (spec 041 T-15); one per city, so it never grows. */
  CAT_SALON: {
    type: 'CAT_SALON',
    name: '猫咪美容院',
    basePrice: 1500,
    growth: [1, 1],
    homeCapacity: 0,
  },
} as const;
/** A city has at most this many salons. */
export const MAX_SALONS = 1;
/** What one restyle at the salon costs (spec 041 cat-looks.md 3): a little, every time. */
export const RESTYLE_PRICE = 50;
/**
 * A cafe earns from its customers (spec 040): cats whose home is within `range` tiles,
 * each cat at one cafe only, at most `seats` per cafe.
 */
export const CAFE = { coinsPerCustomer: 1, range: 3, seats: 5 } as const;
const PRICE_STEP = 5n;
/** No price passes the most coins a world can hold (Core's WORLD_LIMIT). */
export const MAX_PRICE = 1_000_000_000;
/**
 * base × growth^count, to the nearest 5 (an exact half rounds down), at most MAX_PRICE.
 * Exact integers, never floating point. `growth` is a fraction.
 */
export function growingPrice(
  basePrice: number,
  growth: readonly [number, number],
  count: number,
): number {
  const value = BigInt(basePrice) * BigInt(growth[0]) ** BigInt(count);
  const unit = PRICE_STEP * BigInt(growth[1]) ** BigInt(count);
  const price = ((2n * value + unit - 1n) / (2n * unit)) * PRICE_STEP;
  return Number(price < BigInt(MAX_PRICE) ? price : BigInt(MAX_PRICE));
}
/** The price of one more building when `existing` of its type stand. */
export const buildingPrice = (
  type: (typeof BUILDING_IDS)[number],
  existing: number,
): number =>
  growingPrice(BUILDINGS[type].basePrice, BUILDINGS[type].growth, existing);
/** Land costs more the further it lies outside the starter district. */
export const LAND_PRICE = { base: 50, perTile: 25 } as const;
/** Roads cost a real share of land (spec 014); buildings never lay them for free. */
export const CITY_COSTS = {
  placeRoad: 30,
  upgradeRoad: 40,
} as const;
/** Everything paid for a road surface; removing the road refunds it in full. */
export const ROAD_PRICE = {
  DIRT: CITY_COSTS.placeRoad,
  STONE: CITY_COSTS.placeRoad + CITY_COSTS.upgradeRoad,
} as const;
export const WALK_MINUTES = { GRASS: 6, DIRT: 3, STONE: 2 } as const;
/**
 * Waiting on the action card, and the city clock speeds: game minutes per real second
 * while the page is in the foreground (tapping cycles through them).
 */
export const CITY_TIME = { waitMinutes: 10, speeds: [1, 2, 4] } as const;

/** The starting city: square map size, owned starter district, its crossroads and funds. */
export const CITY_START = {
  size: 10,
  coins: 1000,
  /** A new game opens at 07:00 on day 1. */
  minute: 7 * 60,
  starterDistrict: { min: 3, max: 6 },
  crossroads: { x: 5, y: 5 },
} as const;

const outside = (value: number) =>
  Math.max(
    CITY_START.starterDistrict.min - value,
    0,
    value - CITY_START.starterDistrict.max,
  );
/**
 * Tiles between a plot and the starter district: the grid distance to the district's
 * rectangle, less one, so plots sharing an edge with it count 0.
 */
const landDistance = (position: { x: number; y: number }): number =>
  Math.max(0, outside(position.x) + outside(position.y) - 1);
export const landPrice = (position: { x: number; y: number }): number =>
  LAND_PRICE.base + LAND_PRICE.perTile * landDistance(position);
