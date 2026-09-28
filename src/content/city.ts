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
export const CITY_COSTS = {
  buyLand: 50,
  placeRoad: 10,
  upgradeRoad: 20,
} as const;
export const WALK_MINUTES = { GRASS: 10, DIRT: 5, STONE: 3 } as const;
