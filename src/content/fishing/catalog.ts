import { FISHING } from './spec';

/** Fish, bait and waterway data. Tuning numbers live in spec.ts; derivations in rules.ts. */
const { encounter, supplies } = FISHING;
const LEFT = `向左抛（小于 −${encounter.sideDegrees}°）`;
const RIGHT = `向右抛（大于 ${encounter.sideDegrees}°）`;

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
    clue: `池塘或河湾，${LEFT}`,
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
    clue: '池塘或河湾的中央与右侧；月光湖用面包饵',
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
    clue: '芦苇河湾用蚯蚓饵；月光湖的常见鱼',
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
    clue: `芦苇河湾${RIGHT}，虾饵，力度至少 ${encounter.strongPower}%`,
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
    clue: '月光湖左侧配蚯蚓饵',
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
    clue: `月光湖${RIGHT}，虾饵，力度至少 ${encounter.moonCarpPower}% 时有机会`,
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
    clue: '潮汐海岸的常见鱼',
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
    clue: `潮汐海岸${RIGHT}，虾饵，力度至少 ${encounter.strongPower}%`,
  },
] as const;
export const BAITS: Record<
  BaitId,
  { name: string; price: number; hint: string }
> = {
  BREAD: {
    name: '面包',
    price: 0,
    hint: `无限供应 · 力度低于 ${supplies.breadPowerBelow}% 可能钓到补给`,
  },
  WORM: { name: '蚯蚓', price: 6, hint: '河湾引来鲈鱼，月光湖左侧引来锦鲤' },
  SHRIMP: {
    name: '虾饵',
    price: 12,
    hint: '向右大力抛：鲶鱼、海鲷、月光鲤',
  },
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

export const fishStars = (stars: number) =>
  stars === 0 ? '0 星' : '★'.repeat(stars);
export const LOOT = {
  trash: '钓获垃圾',
  can: '密封猫罐头',
  coins: '金币袋',
} as const;
export type CatchKind = 'fish' | 'can' | 'coins';
