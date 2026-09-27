import type { CatEntity, Position } from '../core/schema';

export const CAT_CAFE = {
  type: 'CAT_CAFE',
  cost: 300,
  income: 10,
  intervalMinutes: 60,
} as const;
export const MOCHI = {
  definitionId: 'MOCHI',
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
    needs: { hunger: 30, energy: 80, social: 50 },
    relationships: [],
    memories: [],
    playerBond: 0,
    home: null,
    favoritePlaces: [],
    dailyRoutine: [],
    currentActivity: 'resting',
    lastBondMinute: null,
  };
}
