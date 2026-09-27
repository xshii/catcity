import { z } from 'zod';

export const integer = z.number().int().min(0).max(1_000_000_000);
export const positionSchema = z.strictObject({ x: integer, y: integer });
const percent = z.number().int().min(0).max(100);
const text = z.string().min(1).max(500);
const memorySchema = z.strictObject({
  id: text,
  kind: z.literal('conversation'),
  minute: integer,
  message: text,
  reply: text,
});
export const catSchema = z.strictObject({
  id: text,
  definitionId: z.literal('MOCHI'),
  name: text,
  appearance: z.strictObject({ coat: z.literal('cream') }),
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
    .max(16),
  memories: z.array(memorySchema).max(50),
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
});
export const buildingSchema = z.strictObject({
  id: text,
  type: z.literal('CAT_CAFE'),
  position: positionSchema,
  builtAtMinute: integer,
  incomeProgress: z.number().int().min(0).max(59),
});
export const worldSchema = z.strictObject({
  seed: z.number().int().min(0).max(0xffffffff),
  rngState: z.number().int().min(0).max(0xffffffff),
  minute: integer,
  coins: integer,
  nextId: integer.min(1),
  map: z.strictObject({ width: z.literal(10), height: z.literal(10) }),
  buildings: z.array(buildingSchema).max(1),
  cats: z.array(catSchema).min(1).max(16),
});
export type Position = z.infer<typeof positionSchema>;
export type CatEntity = z.infer<typeof catSchema>;
export type BuildingEntity = z.infer<typeof buildingSchema>;
export type WorldState = z.infer<typeof worldSchema>;
export const saveSchema = z.strictObject({
  saveVersion: z.literal(1),
  contentVersion: z.literal(1),
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
      const match = /^(building|cat|memory)-(\d+)$/.exec(id);
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
  return world;
}
