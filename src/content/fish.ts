import type { CatBreed } from './breeds';
export const FISH_IDS = [
  'SILVER',
  'CRUCIAN',
  'PERCH',
  'CATFISH',
  'KOI',
  'MOON_CARP',
  'MACKEREL',
  'SEA_BREAM',
] as const;
export type FishId = (typeof FISH_IDS)[number];
export const BAIT_IDS = ['BREAD', 'WORM', 'SHRIMP'] as const;
export type BaitId = (typeof BAIT_IDS)[number];
export const SPOT_IDS = ['POND', 'REEDS', 'COAST', 'MOON'] as const;
export type SpotId = (typeof SPOT_IDS)[number];
export const FISH = [
  {
    id: 'SILVER',
    name: '银鱼',
    stars: 0,
    price: 8,
    requiredBreed: null,
    minLengthMm: 80,
    maxLengthMm: 180,
    minWeight: 80,
    maxWeight: 200,
    behavior: '平稳巡游',
    color: '#a7cbd4',
    bait: 'BREAD',
    clue: '池塘左侧，轻至中等力度',
  },
  {
    id: 'CRUCIAN',
    name: '鲫鱼',
    stars: 1,
    price: 12,
    requiredBreed: null,
    minLengthMm: 150,
    maxLengthMm: 400,
    minWeight: 200,
    maxWeight: 600,
    behavior: '缓缓摆动',
    color: '#bcaa86',
    bait: 'BREAD',
    clue: '池塘中央或右侧，中等力度',
  },
  {
    id: 'PERCH',
    name: '鲈鱼',
    stars: 2,
    price: 24,
    requiredBreed: null,
    minLengthMm: 250,
    maxLengthMm: 600,
    minWeight: 400,
    maxWeight: 1200,
    behavior: '来回冲刺',
    color: '#829e72',
    bait: 'WORM',
    clue: '芦苇河湾，蚯蚓饵更常见',
  },
  {
    id: 'CATFISH',
    name: '鲶鱼',
    stars: 3,
    price: 30,
    requiredBreed: null,
    minLengthMm: 350,
    maxLengthMm: 1000,
    minWeight: 600,
    maxWeight: 2000,
    behavior: '深水拉扯',
    color: '#8799af',
    bait: 'SHRIMP',
    clue: '芦苇河湾右侧，较大力度配虾饵',
  },
  {
    id: 'KOI',
    name: '锦鲤',
    stars: 4,
    price: 55,
    requiredBreed: 'RAGDOLL',
    minLengthMm: 300,
    maxLengthMm: 800,
    minWeight: 500,
    maxWeight: 1800,
    behavior: '突然转向',
    color: '#e59777',
    bait: 'WORM',
    clue: '月光湖左侧，中等力度配蚯蚓',
  },
  {
    id: 'MOON_CARP',
    name: '月光鲤',
    stars: 5,
    price: 100,
    requiredBreed: 'BRITISH_SHORTHAIR',
    minLengthMm: 500,
    maxLengthMm: 1200,
    minWeight: 800,
    maxWeight: 2500,
    behavior: '连续变向',
    color: '#a497ce',
    bait: 'SHRIMP',
    clue: '月光湖右侧远水，虾饵有机会引来',
  },
  {
    id: 'MACKEREL',
    name: '鲭鱼',
    stars: 2,
    price: 28,
    requiredBreed: null,
    minLengthMm: 200,
    maxLengthMm: 600,
    minWeight: 250,
    maxWeight: 1400,
    behavior: '沿浪巡游',
    color: '#6598ae',
    bait: 'WORM',
    clue: '海岸常见鱼；蚯蚓饵或左侧落点',
  },
  {
    id: 'SEA_BREAM',
    name: '海鲷',
    stars: 3,
    price: 38,
    requiredBreed: null,
    minLengthMm: 250,
    maxLengthMm: 900,
    minWeight: 400,
    maxWeight: 2400,
    behavior: '贴礁拉扯',
    color: '#d5969e',
    bait: 'SHRIMP',
    clue: '海岸右侧，力度至少 55% 配虾饵',
  },
] as const;
export const fishById = (id: FishId) => FISH.find((fish) => fish.id === id)!;
export const BAITS: Record<
  BaitId,
  { name: string; price: number; hint: string }
> = {
  BREAD: { name: '面包', price: 0, hint: '无限供应 · 适合常见鱼' },
  WORM: { name: '蚯蚓', price: 6, hint: '适合鲈鱼、锦鲤和海岸鲭鱼' },
  SHRIMP: { name: '虾饵', price: 12, hint: '适合鲶鱼、月光鲤和海鲷' },
};
export const SPOTS: Record<
  SpotId,
  {
    name: string;
    level: number;
    species: number;
    fish: readonly FishId[];
    hint: string;
  }
> = {
  POND: {
    name: '家门口池塘',
    level: 1,
    species: 0,
    fish: ['SILVER', 'CRUCIAN'],
    hint: '安静浅水，适合练习提竿',
  },
  REEDS: {
    name: '芦苇河湾',
    level: 2,
    species: 2,
    fish: ['SILVER', 'CRUCIAN', 'PERCH', 'CATFISH'],
    hint: '芦苇与深水交界，鱼儿开始冲刺',
  },
  MOON: {
    name: '月光湖',
    level: 4,
    species: 4,
    fish: ['CRUCIAN', 'PERCH', 'KOI', 'MOON_CARP'],
    hint: '月色中的远水，寻找稀有鱼影',
  },
  COAST: {
    name: '潮汐海岸',
    level: 3,
    species: 3,
    fish: ['MACKEREL', 'SEA_BREAM'],
    hint: '海浪和礁石之间，寻找海水鱼',
  },
};

/** Derive the atlas habitat range from the same pools used to validate catches. */
export function fishHabitats(id: FishId): SpotId[] {
  return SPOT_IDS.filter((spotId) => SPOTS[spotId].fish.includes(id));
}

export const skillLevel = (xp: number) => Math.min(10, 1 + Math.floor(xp / 40));
export function spotUnlocked(
  spot: SpotId,
  xp: number,
  discovered: number,
): boolean {
  return (
    skillLevel(xp) >= SPOTS[spot].level && discovered >= SPOTS[spot].species
  );
}

export function canCatchFish(id: FishId, breed: CatBreed): boolean {
  const required = fishById(id).requiredBreed;
  return required === null || required === breed;
}
export const fishStars = (stars: number) =>
  stars === 0 ? '0 星' : '★'.repeat(stars);
export const LOOT = {
  trash: '钓获垃圾',
  can: '密封猫罐头',
  coins: '金币袋',
} as const;
export type CatchKind = 'fish' | 'can' | 'coins';
