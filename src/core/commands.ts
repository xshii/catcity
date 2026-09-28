import { z } from 'zod';
import { BUILDING_IDS } from '../content/city';
import { baitIdSchema, spotIdSchema } from './fishing/schema';
import { positionSchema } from './schema';
import type { SpotId } from '../content/fishing';

export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('WALK_CAT'),
    catId: z.string().min(1).max(100),
    destination: positionSchema,
  }),
  z.strictObject({ type: z.literal('BUY_LAND'), position: positionSchema }),
  z.strictObject({ type: z.literal('PLACE_ROAD'), position: positionSchema }),
  z.strictObject({ type: z.literal('UPGRADE_ROAD'), position: positionSchema }),
  z.strictObject({
    type: z.literal('BUILD_BUILDING'),
    buildingType: z.enum(BUILDING_IDS),
    position: positionSchema,
  }),
  z.strictObject({
    type: z.literal('MOVE_BUILDING'),
    buildingId: z.string().min(1).max(100),
    position: positionSchema,
  }),
  z.strictObject({
    type: z.literal('ASSIGN_HOME'),
    catId: z.string().min(1).max(100),
    buildingId: z.string().min(1).max(100),
  }),
  z.strictObject({
    type: z.literal('TRAVEL_TO_FISHING_SPOT'),
    catId: z.string().min(1).max(100),
    spotId: spotIdSchema,
  }),
  z.strictObject({
    type: z.literal('REST_CAT'),
    catId: z.string().min(1).max(100),
  }),
  z.strictObject({
    type: z.literal('USE_CAN'),
    catId: z.string().min(1).max(100),
  }),
  z.strictObject({ type: z.literal('RECYCLE_TRASH') }),
  z.strictObject({
    type: z.literal('FISH_BEGIN'),
    catId: z.string().min(1).max(100),
    baitId: baitIdSchema,
    direction: z.number().int().min(-45).max(45),
    aimDepth: z.number().int().min(0).max(100),
    spotId: spotIdSchema,
  }),
  z.strictObject({
    type: z.literal('FISH_CAST'),
    runId: z.string().min(1).max(100),
    power: z.number().int().min(0).max(100),
  }),
  z.strictObject({
    type: z.literal('FISH_CONTROL'),
    runId: z.string().min(1).max(100),
    pressed: z.boolean(),
    ticks: z.number().int().min(1).max(4),
  }),
  z.strictObject({
    type: z.literal('FISH_MOTION_CONTROL'),
    runId: z.string().min(1).max(100),
    x: z.number().int().min(0).max(100),
    y: z.number().int().min(0).max(100),
    ticks: z.number().int().min(1).max(4),
  }),
  z.strictObject({
    type: z.literal('FISH_CANCEL'),
    runId: z.string().min(1).max(100),
  }),
  z.strictObject({
    type: z.literal('SELL_FISH'),
    fishId: z.string().min(1).max(100),
  }),
  z.strictObject({
    type: z.literal('GIFT_FISH'),
    fishId: z.string().min(1).max(100),
    catId: z.string().min(1).max(100),
  }),
  z.strictObject({
    type: z.literal('BUY_BAIT'),
    baitId: z.enum(['WORM', 'SHRIMP']),
  }),
  z.strictObject({ type: z.literal('INVITE_PEPPER') }),
  z.strictObject({
    type: z.literal('ADVANCE_TIME'),
    minutes: z.number().int().min(0).max(43200),
  }),
  z.strictObject({
    type: z.literal('INTERACT'),
    catId: z.string().min(1).max(100),
    message: z.string().trim().min(1).max(500),
    reply: z.string().trim().min(1).max(500),
  }),
  z.strictObject({
    type: z.literal('DEBUG_ADD_COINS'),
    amount: z.number().int().min(1).max(1000000),
  }),
  z.strictObject({
    type: z.literal('DEBUG_SPAWN_CAT'),
    position: positionSchema,
  }),
]);
export type GameCommand = z.infer<typeof commandSchema>;
export type GameEvent =
  | { type: 'CityChanged'; minute: number; action: string; entityId?: string }
  | {
      type: 'WalkStarted' | 'WalkBlocked' | 'WalkFinished';
      minute: number;
      entityId: string;
    }
  | {
      type: 'FishingSpotReached';
      minute: number;
      entityId: string;
      from: SpotId | null;
      spotId: SpotId;
      minutes: number;
    }
  | {
      type: 'CatRestStarted' | 'CatRestFinished' | 'EnergyRecovered';
      minute: number;
      entityId: string;
    }
  | { type: 'FishingChanged'; minute: number; action: string; entityId: string }
  | { type: 'BuildingBuilt'; minute: number; entityId: string; cost: number }
  | {
      type: 'IncomeGenerated';
      minute: number;
      entityId: string;
      amount: number;
    }
  | {
      type: 'CatMoved';
      minute: number;
      entityId: string;
      reason: 'walking';
    }
  | { type: 'ConversationRecorded'; minute: number; entityId: string }
  | { type: 'DebugChanged'; minute: number };
export type CommandResult =
  { ok: true; events: GameEvent[] } | { ok: false; error: string };

export class CommandError extends Error {}
