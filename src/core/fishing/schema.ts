import { WORLD_LIMIT } from '../limits';
import { z } from 'zod';
import { CAT_BREED_IDS } from '../../content/breeds';
import { BAIT_IDS, FISH_IDS, FISHING, SPOT_IDS } from '../../content/fishing';

const count = z.number().int().min(0).max(WORLD_LIMIT);
/** Buying stops at the bait cap, so a save above it was never reached. */
const baitCount = z.number().int().min(0).max(FISHING.bait.max);
const pct = z.number().int().min(0).max(100);
const id = z.string().min(1).max(100);
export const catBreedSchema = z.enum(CAT_BREED_IDS);
const catchKindSchema = z.enum(['fish', 'can', 'coins']);
export const fishIdSchema = z.enum(FISH_IDS);
export const baitIdSchema = z.enum(BAIT_IDS);
export const spotIdSchema = z.enum(SPOT_IDS);
export const fishingMemorySchema = z.strictObject({
  runId: id,
  speciesId: fishIdSchema,
  spotId: spotIdSchema,
  minute: count,
});
export const giftSchema = z.strictObject({
  fishId: id,
  speciesId: fishIdSchema,
  minute: count,
  favorite: z.boolean(),
});
const anglingSchema = z.strictObject({
  id,
  catId: id,
  catBreed: catBreedSchema,
  catchKind: catchKindSchema,
  lengthMm: count,
  lootAmount: count,
  seed: z.number().int().min(0).max(0xffffffff),
  baitId: baitIdSchema,
  spotId: spotIdSchema,
  direction: z.number().int().min(-45).max(45),
  aimDepth: pct,
  skillLevel: z.number().int().min(1).max(10),
  phase: z.enum(['charge', 'waiting', 'hook', 'fight', 'caught', 'escaped']),
  tick: count,
  phaseTick: count,
  power: pct,
  cursor: pct,
  pressed: z.boolean(),
  hasHeld: z.boolean(),
  speciesId: fishIdSchema.nullable(),
  weight: count,
  precision: z.boolean(),
  tension: pct,
  progress: pct,
  lineHealth: pct,
  reason: z.enum(['none', 'missed-hook', 'line-break', 'escaped']),
  mode: z.enum(['buttons', 'motion']),
  strike: z.enum(['none', 'perfect', 'good']),
  spooked: z.boolean(),
  hold: count,
  happy: z.boolean(),
});
export const fishingSchema = z.strictObject({
  supplies: z.strictObject({ trash: count, cans: count, coinBags: count }),
  xp: count,
  baits: z.strictObject({ WORM: baitCount, SHRIMP: baitCount }),
  active: anglingSchema.nullable(),
  inventory: z
    .array(
      z.strictObject({
        id,
        speciesId: fishIdSchema,
        weight: count.min(1),
        lengthMm: count.min(1),
      }),
    )
    .max(30),
  atlas: z.record(
    fishIdSchema,
    z.strictObject({ count, bestWeight: count, bestLengthMm: count }),
  ),
  lastResult: z
    .strictObject({
      runId: id,
      catId: id,
      spotId: spotIdSchema,
      minute: count,
      caught: z.boolean(),
      trashAmount: z.number().int().min(0).max(1),
      speciesId: fishIdSchema.nullable(),
      catchKind: catchKindSchema,
      lengthMm: count,
      lootAmount: count,
      weight: count,
      reason: z.enum(['none', 'missed-hook', 'line-break', 'escaped']),
    })
    .nullable(),
});
export function initialFishing(): z.infer<typeof fishingSchema> {
  const atlas = Object.fromEntries(
    FISH_IDS.map((key) => [key, { count: 0, bestWeight: 0, bestLengthMm: 0 }]),
  ) as z.infer<typeof fishingSchema>['atlas'];
  return {
    supplies: { trash: 0, cans: 0, coinBags: 0 },
    xp: 0,
    baits: { ...FISHING.bait.initial },
    active: null,
    inventory: [],
    atlas,
    lastResult: null,
  };
}
