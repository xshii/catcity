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
/**
 * A cat's look: five choices, each from a fixed list (spec 041 cat-looks.md 1), in the
 * order the cat maker shows them. Saved on the cat; the art draws each.
 */
export const APPEARANCE_OPTIONS = {
  colour: ['black', 'gray', 'orange', 'cream', 'white', 'brown'],
  pattern: ['solid', 'tabby', 'point'],
  white: ['none', 'mittens', 'bib', 'cow', 'bicolour'],
  eyes: ['blue', 'copper', 'green'],
  face: ['round', 'pointed', 'long'],
} as const;
export type CatAppearance = {
  -readonly [
    Item in keyof typeof APPEARANCE_OPTIONS
  ]: (typeof APPEARANCE_OPTIONS)[Item][number];
};
/** A solid round-faced look: T-13's coats, each cat's own until the salon (T-15). */
const plainLook = (
  colour: CatAppearance['colour'],
  eyes: CatAppearance['eyes'],
  white: CatAppearance['white'] = 'none',
): CatAppearance => ({ colour, pattern: 'solid', white, eyes, face: 'round' });
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

/**
 * Every personality word a cat can have, and how the player reads it (R-10): the
 * templates' words, which kittens take from their parents (R-33).
 */
const PERSONALITY_WORDS = {
  shy: '胆小',
  'food-loving': '贪吃',
  'slow-to-warm': '慢热',
  curious: '好奇',
  playful: '活泼',
  adventurous: '爱冒险',
  gentle: '温柔',
  sleepy: '爱睡',
  clingy: '黏人',
  brave: '勇敢',
  steady: '沉稳',
  sweet: '爱撒娇',
  chatty: '话多',
  easygoing: '随和',
  lazy: '懒洋洋',
} as const;
export type Personality = keyof typeof PERSONALITY_WORDS;
/** A cat's personality as the player reads it: its words, in order. */
export const personalityLabel = (personality: readonly string[]): string =>
  personality.map((word) => PERSONALITY_WORDS[word as Personality]).join(' · ');

/** Resident templates: identity, tastes and starting needs. Instances live in Core. */
export const CAT_DEFINITIONS: Record<
  CatDefinitionId,
  {
    breedId: CatBreed;
    name: string;
    sex: 'F' | 'M';
    /** How it looks when it arrives; Mochi's is the stray's until the player picks one. */
    appearance: CatAppearance;
    personality: readonly Personality[];
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
    appearance: plainLook('cream', 'blue'),
    personality: ['shy', 'food-loving', 'slow-to-warm'],
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
    appearance: plainLook('gray', 'copper'),
    personality: ['curious', 'playful', 'adventurous'],
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
    appearance: plainLook('gray', 'copper'),
    personality: ['gentle', 'sleepy', 'clingy'],
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
    appearance: plainLook('black', 'green', 'bicolour'),
    personality: ['brave', 'steady'],
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
    appearance: plainLook('cream', 'blue'),
    personality: ['sweet', 'chatty'],
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
    appearance: plainLook('orange', 'green'),
    personality: ['easygoing', 'lazy'],
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
