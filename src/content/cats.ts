import type { CatBreed } from './breeds';
import type { FishId } from './fishing';

/** Starter id of the first resident; other cats get allocated `cat-N` ids. */
export const STARTER_CAT_ID = 'mochi';

export const CAT_DEFINITION_IDS = ['MOCHI', 'PEPPER'] as const;
export type CatDefinitionId = (typeof CAT_DEFINITION_IDS)[number];
/** The coats a cat can wear (ui-design 6.1); the art gives each its colours. */
export const CAT_COATS = ['cream', 'gray', 'orange', 'tuxedo'] as const;

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
};

/** Every new resident starts with these needs and mood. */
export const CAT_START = {
  mood: 70,
  needs: { energy: 100 },
} as const;
