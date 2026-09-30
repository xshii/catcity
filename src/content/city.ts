export const BUILDING_IDS = ['CAT_CAFE', 'CAT_APARTMENT'] as const;
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
} as const;
/**
 * A cafe earns from its customers (spec 040): cats whose home is within `range` tiles,
 * each cat at one cafe only, at most `seats` per cafe.
 */
export const CAFE = { coinsPerCustomer: 1, range: 3, seats: 5 } as const;
const PRICE_STEP = 5n;
/** No price passes the most coins a world can hold (Core's WORLD_LIMIT). */
export const MAX_PRICE = 1_000_000_000;
/**
 * The price of one more building when `existing` of its type stand: base × growth^existing,
 * to the nearest 5 (an exact half rounds down), at most MAX_PRICE. Exact integers, never
 * floating point.
 */
export function buildingPrice(
  type: (typeof BUILDING_IDS)[number],
  existing: number,
): number {
  const { basePrice, growth } = BUILDINGS[type];
  const value = BigInt(basePrice) * BigInt(growth[0]) ** BigInt(existing);
  const unit = PRICE_STEP * BigInt(growth[1]) ** BigInt(existing);
  const price = ((2n * value + unit - 1n) / (2n * unit)) * PRICE_STEP;
  return Number(price < BigInt(MAX_PRICE) ? price : BigInt(MAX_PRICE));
}
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
