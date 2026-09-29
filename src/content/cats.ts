import type { CatBreed } from './breeds';
import type { FishId } from './fishing';

/** Starter id of the first resident; other cats get allocated `cat-N` ids. */
export const STARTER_CAT_ID = 'mochi';

export const CAT_DEFINITION_IDS = ['MOCHI', 'PEPPER'] as const;
export type CatDefinitionId = (typeof CAT_DEFINITION_IDS)[number];

/** Resident templates: identity, tastes and starting needs. Instances live in Core. */
export const CAT_DEFINITIONS: Record<
  CatDefinitionId,
  {
    breedId: CatBreed;
    name: string;
    coat: 'cream' | 'gray';
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
