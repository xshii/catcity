import {
  CAT_DEFINITIONS,
  CAT_START,
  type CatDefinitionId,
} from '../content/cats';
import { KITTEN_MINUTES } from '../content/family';
import { CommandError } from './commands';
import type { CatEntity, Position, WorldState } from './schema';

/**
 * Creates a first-generation cat from its template: grown, without parents or talent.
 * Saves carry the instance thereafter.
 */
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
    sex: definition.sex,
    bornMinute: null,
    generation: 1,
    parents: null,
    neutered: false,
    talent: 0,
    lastBredMinute: null,
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
    pettingBond: null,
    lastChatMoodMinute: null,
    petting: { discovered: [], lifted: [] },
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

/** A cat born in the city is a kitten for a while; first-generation cats arrive grown. */
export function catStage(
  world: WorldState,
  cat: CatEntity,
): 'kitten' | 'adult' {
  return cat.bornMinute !== null &&
    world.minute - cat.bornMinute < KITTEN_MINUTES
    ? 'kitten'
    : 'adult';
}
