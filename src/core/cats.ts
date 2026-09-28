import {
  CAT_DEFINITIONS,
  CAT_START,
  type CatDefinitionId,
} from '../content/cats';
import type { CatEntity, Position } from './schema';

/** Creates a fresh resident from its template; saves carry the instance thereafter. */
export function instantiateCat(
  definitionId: CatDefinitionId,
  id: string,
  position: Position,
): CatEntity {
  const definition = CAT_DEFINITIONS[definitionId];
  return {
    id,
    definitionId,
    breedId: definition.breedId,
    name: definition.name,
    appearance: { coat: definition.coat },
    personality: [...definition.personality],
    traits: [...definition.traits],
    preferences: {
      likes: [...definition.likes],
      dislikes: [...definition.dislikes],
    },
    position: { ...position },
    mood: CAT_START.mood,
    needs: { ...CAT_START.needs },
    rest: null,
    fishingSpotId: null,
    walk: null,
    memories: [],
    favoriteFish: [...definition.favoriteFish],
    fishingMemory: null,
    fishGift: null,
    playerBond: 0,
    home: null,
    lastBondMinute: null,
  };
}
