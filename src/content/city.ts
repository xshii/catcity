export const BUILDING_IDS = ['CAT_CAFE', 'CAT_APARTMENT'] as const;
export const BUILDINGS = {
  CAT_CAFE: {
    type: 'CAT_CAFE',
    name: '猫咖',
    cost: 300,
    income: 10,
    intervalMinutes: 60,
    homeCapacity: 0,
  },
  CAT_APARTMENT: {
    type: 'CAT_APARTMENT',
    name: '猫公寓',
    cost: 250,
    income: 0,
    intervalMinutes: 60,
    homeCapacity: 2,
  },
} as const;
/** Roads cost a real share of land (spec 014); removal refunds half of what was paid. */
export const CITY_COSTS = {
  buyLand: 50,
  placeRoad: 30,
  upgradeRoad: 40,
  roadRefund: { DIRT: 15, STONE: 35 },
} as const;
export const WALK_MINUTES = { GRASS: 10, DIRT: 5, STONE: 3 } as const;
/**
 * Waiting on the action card, and the city clock speeds: game minutes per real second
 * while the page is in the foreground (tapping cycles through them).
 */
export const CITY_TIME = { waitMinutes: 10, speeds: [1, 2, 4] } as const;

/** The starting city: square map size, owned starter district, its crossroads and funds. */
export const CITY_START = {
  size: 10,
  coins: 1000,
  starterDistrict: { min: 3, max: 6 },
  crossroads: { x: 5, y: 5 },
} as const;
