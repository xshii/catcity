import { CITY_START } from '../content/city';
import {
  CAT_DEFINITION_IDS,
  CAT_DEFINITIONS,
  STARTER_CAT_ID,
} from '../content/cats';
import {
  MAX_BUILDINGS,
  MAX_CATS,
  MAX_STAT,
  MAX_TEXT,
  WORLD_LIMIT,
} from './limits';
import { CARE } from '../content/care';
import { PETTING, PET_SPOTS } from '../content/petting';
import { z } from 'zod';
import { BUILDING_IDS } from '../content/city';
import { assertCity } from './city/validation';
import {
  fishingSchema,
  fishingMemorySchema,
  giftSchema,
  fishIdSchema,
  catBreedSchema,
  spotIdSchema,
} from './fishing/schema';
import { assertFishing } from './fishing/validation';

const integer = z.number().int().min(0).max(WORLD_LIMIT);
export const positionSchema = z.strictObject({ x: integer, y: integer });
const percent = z.number().int().min(0).max(MAX_STAT);
const text = z.string().min(1).max(MAX_TEXT);
const memorySchema = z.strictObject({
  id: text,
  kind: z.literal('conversation'),
  minute: integer,
  message: text,
  reply: text,
});
const catSchema = z.strictObject({
  id: text,
  definitionId: z.enum(CAT_DEFINITION_IDS),
  name: text,
  appearance: z.strictObject({ coat: z.enum(['cream', 'gray']) }),
  personality: z.array(text).max(10),
  traits: z.array(text).max(10),
  preferences: z.strictObject({
    likes: z.array(text).max(10),
    dislikes: z.array(text).max(10),
  }),
  mood: percent,
  needs: z.strictObject({ hunger: percent, energy: percent }),
  memories: z.array(memorySchema).max(CARE.memoryLimit),
  playerBond: percent,
  home: text.nullable(),
  position: positionSchema,
  lastBondMinute: integer.nullable(),
  fishingSpotId: spotIdSchema.nullable(),
  walk: z
    .strictObject({
      destination: positionSchema,
      route: z.array(positionSchema).min(1).max(100),
      nextStepMinute: integer.nullable(),
      spotId: spotIdSchema.nullable(),
    })
    .nullable(),
  breedId: catBreedSchema,
  favoriteFish: z.array(fishIdSchema).min(1).max(6),
  fishingMemory: fishingMemorySchema.nullable(),
  fishGift: giftSchema.nullable(),
  /** Petting (spec 039): tastes derive from the seed; only what was found out is saved. */
  petting: z.strictObject({
    discovered: z.array(z.enum(PET_SPOTS)).max(PET_SPOTS.length),
    /** The game hour of the latest round and the rounds counted in it, up to the limit. */
    hour: integer.nullable(),
    rounds: z.number().int().min(0).max(PETTING.limit.fullRounds),
  }),
});
const buildingSchema = z.strictObject({
  id: text,
  type: z.enum(BUILDING_IDS),
  position: positionSchema,
  builtAtMinute: integer,
});
const worldSchema = z.strictObject({
  seed: z.number().int().min(0).max(0xffffffff),
  minute: integer,
  coins: integer,
  nextId: integer.min(1),
  map: z.strictObject({
    width: z.literal(CITY_START.size),
    height: z.literal(CITY_START.size),
    generationVersion: z.literal(1),
    tiles: z
      .array(
        z.strictObject({
          position: positionSchema,
          terrain: z.enum(['GRASS', 'POND', 'RIVER', 'LAKE', 'SEA']),
          owned: z.boolean(),
          road: z.enum(['DIRT', 'STONE']).nullable(),
        }),
      )
      .length(CITY_START.size * CITY_START.size),
  }),
  buildings: z.array(buildingSchema).max(MAX_BUILDINGS),
  cats: z.array(catSchema).min(1).max(MAX_CATS),
  fishing: fishingSchema,
});
export type Position = z.infer<typeof positionSchema>;
export type CatEntity = z.infer<typeof catSchema>;
export type BuildingEntity = z.infer<typeof buildingSchema>;
export type WorldState = z.infer<typeof worldSchema>;
export const SAVE_VERSION = 19;
export const CONTENT_VERSION = 8;
export const saveSchema = z.strictObject({
  saveVersion: z.literal(SAVE_VERSION),
  contentVersion: z.literal(CONTENT_VERSION),
  world: worldSchema,
});

export function assertWorld(value: unknown): WorldState {
  const world = worldSchema.parse(value);
  const occupied = new Set<string>();
  const ids = new Set<string>();
  const uniqueId = (id: string) => {
    if (ids.has(id)) throw new Error(`Duplicate entity/memory ID: ${id}`);
    ids.add(id);
    if (id !== STARTER_CAT_ID) {
      const match = /^(building|cat|memory|angling|fish)-(\d+)$/.exec(id);
      if (!match || Number(match[2]) >= world.nextId)
        throw new Error('Invalid ID allocation');
    }
  };
  for (const entity of [...world.buildings, ...world.cats]) {
    uniqueId(entity.id);
    const { x, y } = entity.position;
    const key = `${x},${y}`;
    if (x >= world.map.width || y >= world.map.height || occupied.has(key))
      throw new Error('Invalid entity placement');
    occupied.add(key);
  }
  if (!world.cats.some((cat) => cat.id === STARTER_CAT_ID))
    throw new Error('Mochi must persist');
  for (const building of world.buildings) {
    if (building.builtAtMinute > world.minute)
      throw new Error('Invalid income clock');
  }
  for (const cat of world.cats) {
    assertTemplate(cat, world.cats);
    if (cat.lastBondMinute !== null && cat.lastBondMinute > world.minute)
      throw new Error('Future bond');
    if (
      cat.home !== null &&
      !world.buildings.some((building) => building.id === cat.home)
    )
      throw new Error('Unknown home');
    const { discovered, hour, rounds } = cat.petting;
    if (
      discovered.some(
        (spot, index) =>
          index > 0 &&
          PET_SPOTS.indexOf(spot) <= PET_SPOTS.indexOf(discovered[index - 1]!),
      ) ||
      (hour === null) !== (rounds === 0) ||
      (hour !== null &&
        hour > Math.floor(world.minute / PETTING.limit.hourMinutes))
    )
      throw new Error('Invalid petting record');
    let previousMinute = -1;
    for (const memory of cat.memories) {
      uniqueId(memory.id);
      if (memory.minute > world.minute || memory.minute < previousMinute)
        throw new Error('Invalid memory chronology');
      previousMinute = memory.minute;
    }
  }
  assertCity(world);
  assertFishing(world, uniqueId);
  return world;
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);

/** Identity and tastes come from the template; only the name is free text. */
function assertTemplate(cat: CatEntity, cats: readonly CatEntity[]) {
  const definition = CAT_DEFINITIONS[cat.definitionId];
  if (
    cat.breedId !== definition.breedId ||
    cat.appearance.coat !== definition.coat ||
    !sameList(cat.personality, definition.personality) ||
    !sameList(cat.traits, definition.traits) ||
    !sameList(cat.preferences.likes, definition.likes) ||
    !sameList(cat.preferences.dislikes, definition.dislikes) ||
    !sameList(cat.favoriteFish, definition.favoriteFish)
  )
    throw new Error('Cat does not match its template');
  if (
    definition.unique &&
    cats.filter((other) => other.definitionId === cat.definitionId).length > 1
  )
    throw new Error('Duplicate unique resident');
}
