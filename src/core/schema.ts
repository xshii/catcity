import { MAX_BUILDINGS, MAX_CATS, MAX_STAT, WORLD_LIMIT } from './limits';
import { CARE } from '../content/care';
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
const text = z.string().min(1).max(500);
const memorySchema = z.strictObject({
  id: text,
  kind: z.literal('conversation'),
  minute: integer,
  message: text,
  reply: text,
});
const catSchema = z.strictObject({
  id: text,
  definitionId: z.enum(['MOCHI', 'PEPPER']),
  name: text,
  appearance: z.strictObject({ coat: z.enum(['cream', 'gray']) }),
  personality: z.array(text).max(10),
  traits: z.array(text).max(10),
  preferences: z.strictObject({
    likes: z.array(text).max(10),
    dislikes: z.array(text).max(10),
  }),
  mood: percent,
  needs: z.strictObject({ hunger: percent, energy: percent, social: percent }),
  relationships: z
    .array(z.strictObject({ catId: text, bond: percent }))
    .max(MAX_CATS),
  memories: z.array(memorySchema).max(CARE.memoryLimit),
  playerBond: percent,
  home: text.nullable(),
  favoritePlaces: z.array(text).max(10),
  dailyRoutine: z
    .array(
      z.strictObject({ hour: z.number().int().min(0).max(23), activity: text }),
    )
    .max(24),
  currentActivity: z.enum(['resting', 'wandering', 'chatting']),
  position: positionSchema,
  lastBondMinute: integer.nullable(),
  rest: z.strictObject({ startedAt: integer, until: integer }).nullable(),
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
});
const buildingSchema = z.strictObject({
  id: text,
  type: z.enum(BUILDING_IDS),
  position: positionSchema,
  builtAtMinute: integer,
  incomeProgress: z.number().int().min(0).max(59),
});
const worldSchema = z.strictObject({
  seed: z.number().int().min(0).max(0xffffffff),
  rngState: z.number().int().min(0).max(0xffffffff),
  minute: integer,
  coins: integer,
  nextId: integer.min(1),
  map: z.strictObject({
    width: z.literal(10),
    height: z.literal(10),
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
      .length(100),
  }),
  buildings: z.array(buildingSchema).max(MAX_BUILDINGS),
  cats: z.array(catSchema).min(1).max(MAX_CATS),
  fishing: fishingSchema,
});
export type Position = z.infer<typeof positionSchema>;
export type CatEntity = z.infer<typeof catSchema>;
export type BuildingEntity = z.infer<typeof buildingSchema>;
export type WorldState = z.infer<typeof worldSchema>;
export const SAVE_VERSION = 10;
export const CONTENT_VERSION = 5;
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
    if (id !== 'mochi') {
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
  if (!world.cats.some((cat) => cat.id === 'mochi'))
    throw new Error('Mochi must persist');
  for (const building of world.buildings) {
    if (
      building.builtAtMinute > world.minute ||
      building.incomeProgress !== (world.minute - building.builtAtMinute) % 60
    )
      throw new Error('Invalid income clock');
  }
  for (const cat of world.cats) {
    if (
      cat.rest &&
      (cat.rest.startedAt > world.minute ||
        cat.rest.until !== cat.rest.startedAt + CARE.rest.minutes ||
        cat.rest.until <= world.minute ||
        world.fishing.active?.catId === cat.id)
    )
      throw new Error('Invalid cat rest');
    if (cat.lastBondMinute !== null && cat.lastBondMinute > world.minute)
      throw new Error('Future bond');
    if (
      cat.home !== null &&
      !world.buildings.some((building) => building.id === cat.home)
    )
      throw new Error('Unknown home');
    if (
      cat.favoritePlaces.some(
        (id) => !world.buildings.some((building) => building.id === id),
      )
    )
      throw new Error('Unknown favorite place');
    if (
      cat.relationships.some(
        (relation) =>
          relation.catId === cat.id ||
          !world.cats.some((other) => other.id === relation.catId),
      )
    )
      throw new Error('Unknown relationship');
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
