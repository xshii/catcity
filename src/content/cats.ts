import type { CatBreed } from './breeds';
import { growingPrice } from './city';
import type { FishId } from './fishing';

/** Starter id of the first resident; other cats get allocated `cat-N` ids. */
export const STARTER_CAT_ID = 'mochi';

export const CAT_DEFINITION_IDS = [
  'MOCHI',
  'PEPPER',
  'NIANGAO',
  'ZHIMA',
  'BUDING',
  'DOUBAO',
] as const;
export type CatDefinitionId = (typeof CAT_DEFINITION_IDS)[number];
/** The coats a cat can wear (ui-design 6.1); the art gives each its colours. */
export const CAT_COATS = ['cream', 'gray', 'orange', 'tuxedo'] as const;
/** The first-generation cats a player can invite, in the order the list shows them; Mochi starts in the city. */
export const INVITABLE_CATS: readonly CatDefinitionId[] =
  CAT_DEFINITION_IDS.filter((id) => id !== 'MOCHI');
/**
 * Companion cats the city holds at most, invited or born (R-13); the engine bound MAX_CATS
 * is higher. Ten, not eight (user 2026-09-30): with grandparents counted as the direct line,
 * a fifth generation needs nine cats.
 */
export const MAX_COMPANIONS = 10;
/** An invitation costs 200 coins, twice as much as the one before (spec 041 design 4). */
const INVITE = { basePrice: 200, growth: [2, 1] } as const;
/** The price of the next invitation when `invited` cats have come by invitation. */
export const invitePrice = (invited: number): number =>
  growingPrice(INVITE.basePrice, INVITE.growth, invited);

/** Resident templates: identity, tastes and starting needs. Instances live in Core. */
export const CAT_DEFINITIONS: Record<
  CatDefinitionId,
  {
    breedId: CatBreed;
    name: string;
    sex: 'F' | 'M';
    coat: (typeof CAT_COATS)[number];
    personality: readonly string[];
    /** Player-facing summary of `personality`. */
    personalityLabel: string;
    traits: readonly string[];
    likes: readonly string[];
    dislikes: readonly string[];
    favoriteFish: readonly FishId[];
    /** At most one resident of this template (debug spawns may copy Mochi). */
    unique: boolean;
  }
> = {
  MOCHI: {
    breedId: 'RAGDOLL',
    name: 'Mochi',
    sex: 'F',
    coat: 'cream',
    personality: ['shy', 'food-loving', 'slow-to-warm'],
    personalityLabel: '胆小 · 贪吃 · 慢热',
    traits: ['gentle'],
    likes: ['fish', 'quiet', 'windows'],
    dislikes: ['noise', 'crowds'],
    favoriteFish: ['SILVER', 'CRUCIAN'],
    unique: false,
  },
  PEPPER: {
    breedId: 'BRITISH_SHORTHAIR',
    name: 'Pepper',
    sex: 'M',
    coat: 'gray',
    personality: ['curious', 'playful'],
    personalityLabel: '好奇 · 活泼 · 爱冒险',
    traits: ['adventurous'],
    likes: ['fish', 'exploring'],
    dislikes: ['waiting'],
    favoriteFish: ['PERCH', 'CATFISH'],
    unique: true,
  },
  // Each newcomer likes a coast fish and a Moon Lake fish, none that Mochi or Pepper likes.
  NIANGAO: {
    breedId: 'RAGDOLL',
    name: '年糕',
    sex: 'F',
    coat: 'gray',
    personality: ['gentle', 'sleepy', 'clingy'],
    personalityLabel: '温柔 · 爱睡 · 黏人',
    traits: ['calm'],
    likes: ['fish', 'naps', 'laps'],
    dislikes: ['cold'],
    favoriteFish: ['MACKEREL', 'KOI'],
    unique: true,
  },
  ZHIMA: {
    breedId: 'RAGDOLL',
    name: '芝麻',
    sex: 'M',
    // Black sesame on white.
    coat: 'tuxedo',
    personality: ['brave', 'steady'],
    personalityLabel: '勇敢 · 沉稳',
    traits: ['steady'],
    likes: ['fish', 'high-places'],
    dislikes: ['rain'],
    favoriteFish: ['SEA_BREAM', 'KOI'],
    unique: true,
  },
  BUDING: {
    breedId: 'BRITISH_SHORTHAIR',
    name: '布丁',
    sex: 'F',
    coat: 'cream',
    personality: ['sweet', 'chatty'],
    personalityLabel: '爱撒娇 · 话多',
    traits: ['cheerful'],
    likes: ['fish', 'sunshine'],
    dislikes: ['baths'],
    favoriteFish: ['MACKEREL', 'MOON_CARP'],
    unique: true,
  },
  DOUBAO: {
    breedId: 'BRITISH_SHORTHAIR',
    name: '豆包',
    sex: 'M',
    coat: 'orange',
    personality: ['easygoing', 'lazy'],
    personalityLabel: '随和 · 懒洋洋',
    traits: ['easygoing'],
    likes: ['fish', 'boxes'],
    dislikes: ['hurry'],
    favoriteFish: ['SEA_BREAM', 'MOON_CARP'],
    unique: true,
  },
};

/** Every new resident starts with these needs and mood. */
export const CAT_START = {
  mood: 70,
  needs: { energy: 100 },
} as const;
