import {
  CAT_DEFINITIONS,
  CAT_START,
  INVITABLE_CATS,
  MAX_COMPANIONS,
  invitePrice,
  type CatDefinitionId,
} from '../content/cats';
import { BUILDINGS } from '../content/city';
import { KITTEN_MINUTES } from '../content/family';
import { gridDistance } from './city/map';
import { isWalkable } from './city/path';
import { CommandError, type GameEvent } from './commands';
import type { BuildingEntity, CatEntity, Position, WorldState } from './schema';

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
    appearance: { ...definition.appearance },
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

/** A companion's new name (spec 041 R-16): free, as often as wished; nothing else changes. */
export function renameCat(
  world: WorldState,
  catId: string,
  name: string,
): GameEvent[] {
  const cat = requireCat(world, catId);
  if (cat.name === name) throw new CommandError('NAME_UNCHANGED');
  cat.name = name;
  return [{ type: 'CatRenamed', minute: world.minute, entityId: cat.id }];
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

/** Beds nobody sleeps in: each building once per free bed, in the order they were built. */
export function freeBeds(world: WorldState): BuildingEntity[] {
  return world.buildings.flatMap((building) => {
    const residents = world.cats.filter((cat) => cat.home === building.id);
    const free = BUILDINGS[building.type].homeCapacity - residents.length;
    return Array.from({ length: Math.max(0, free) }, () => building);
  });
}

/** What the next invitation costs: it doubles with every cat that came by invitation. */
export const nextInvitePrice = (world: WorldState): number =>
  invitePrice(
    world.cats.filter((cat) => INVITABLE_CATS.includes(cat.definitionId))
      .length,
  );

/**
 * A first-generation cat not yet in the city comes to live in the first free bed (spec
 * 041 design 4). It arrives on the walkable tile nearest its home, ties by row then column.
 */
export function inviteCat(
  world: WorldState,
  definitionId: CatDefinitionId,
): GameEvent[] {
  if (world.cats.some((cat) => cat.definitionId === definitionId))
    throw new CommandError('ALREADY_INVITED');
  if (world.cats.length >= MAX_COMPANIONS)
    throw new CommandError('COMPANION_LIMIT');
  const home = freeBeds(world)[0];
  if (!home) throw new CommandError('NO_BED');
  const cost = nextInvitePrice(world);
  if (world.coins < cost) throw new CommandError('INSUFFICIENT_COINS');
  const distance = (p: Position) => gridDistance(p, home.position);
  const position = world.map.tiles
    .map((tile) => tile.position)
    .filter((p) => isWalkable(world, p))
    .sort((a, b) => distance(a) - distance(b) || a.y - b.y || a.x - b.x)[0];
  if (!position) throw new CommandError('INVALID_PLACEMENT');
  world.coins -= cost;
  const cat = instantiateCat(definitionId, `cat-${world.nextId++}`, position);
  cat.home = home.id;
  world.cats.push(cat);
  return [{ type: 'CatInvited', minute: world.minute, entityId: cat.id, cost }];
}
