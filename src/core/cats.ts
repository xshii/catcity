import {
  CAT_DEFINITIONS,
  CAT_START,
  type CatDefinitionId,
} from '../content/cats';
import { CommandError } from './commands';
import type { CatEntity, Position, WorldState } from './schema';

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
    fishingSpotId: null,
    walk: null,
    memories: [],
    favoriteFish: [...definition.favoriteFish],
    fishingMemory: null,
    fishGift: null,
    playerBond: 0,
    home: null,
    chatBond: null,
    giftBond: null,
    lastChatMoodMinute: null,
  };
}

/** The cat a command names; a missing one rejects the command. */
export function requireCat(world: WorldState, id: string): CatEntity {
  const cat = world.cats.find((cat) => cat.id === id);
  if (!cat) throw new CommandError('CAT_NOT_FOUND');
  return cat;
}

/**
 * Walking and fishing tire a cat; at any other time it recovers by itself. A walk
 * stopped by exhaustion counts as idle and goes on once the cat has energy.
 */
export function catIdle(world: WorldState, cat: CatEntity): boolean {
  return (
    world.fishing.active?.catId !== cat.id &&
    (!cat.walk || cat.walk.nextStepMinute === null)
  );
}
