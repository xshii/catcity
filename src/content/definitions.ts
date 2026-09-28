import type { CatEntity, Position } from '../core/schema';

const MOCHI = {
  definitionId: 'MOCHI',
  breedId: 'RAGDOLL',
  name: 'Mochi',
  appearance: { coat: 'cream' },
  personality: ['shy', 'food-loving', 'slow-to-warm'],
  traits: ['gentle'],
  preferences: {
    likes: ['fish', 'quiet', 'windows'],
    dislikes: ['noise', 'crowds'],
  },
} as const;

export function instantiateMochi(id: string, position: Position): CatEntity {
  return {
    ...MOCHI,
    appearance: { ...MOCHI.appearance },
    personality: [...MOCHI.personality],
    traits: [...MOCHI.traits],
    preferences: {
      likes: [...MOCHI.preferences.likes],
      dislikes: [...MOCHI.preferences.dislikes],
    },
    id,
    position: { ...position },
    mood: 70,
    needs: { hunger: 30, energy: 100, social: 50 },
    rest: null,
    fishingSpotId: null,
    walk: null,
    relationships: [],
    memories: [],
    favoriteFish: ['SILVER', 'CRUCIAN'],
    fishingMemory: null,
    fishGift: null,
    playerBond: 0,
    home: null,
    favoritePlaces: [],
    dailyRoutine: [],
    currentActivity: 'resting',
    lastBondMinute: null,
  };
}

export function instantiatePepper(id: string, position: Position): CatEntity {
  return {
    ...instantiateMochi(id, position),
    definitionId: 'PEPPER',
    breedId: 'BRITISH_SHORTHAIR',
    name: 'Pepper',
    appearance: { coat: 'gray' },
    personality: ['curious', 'playful'],
    traits: ['adventurous'],
    favoriteFish: ['PERCH', 'CATFISH'],
    preferences: { likes: ['fish', 'exploring'], dislikes: ['waiting'] },
  };
}
