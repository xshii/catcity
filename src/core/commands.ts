import { z } from 'zod';
import { BUILDING_IDS } from '../content/city';
import { baitIdSchema, spotIdSchema } from './fishing/schema';
import { positionSchema } from './schema';
import { FISHING, type SpotId } from '../content/fishing';
import { MAX_TEXT } from './limits';

const id = z.string().min(1).max(100);
const { maxDirection, maxDepth, maxPower, maxTicks } = FISHING.input;
const ticks = z.number().int().min(1).max(maxTicks);
/** One ADVANCE_TIME command covers at most 30 game days. */
const MAX_ADVANCE_MINUTES = 30 * 24 * 60;

export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('WALK_CAT'),
    catId: id,
    destination: positionSchema,
  }),
  z.strictObject({ type: z.literal('BUY_LAND'), position: positionSchema }),
  z.strictObject({ type: z.literal('PLACE_ROAD'), position: positionSchema }),
  z.strictObject({ type: z.literal('UPGRADE_ROAD'), position: positionSchema }),
  z.strictObject({ type: z.literal('REMOVE_ROAD'), position: positionSchema }),
  z.strictObject({
    type: z.literal('BUILD_BUILDING'),
    buildingType: z.enum(BUILDING_IDS),
    position: positionSchema,
  }),
  z.strictObject({
    type: z.literal('MOVE_BUILDING'),
    buildingId: id,
    position: positionSchema,
  }),
  z.strictObject({
    type: z.literal('ASSIGN_HOME'),
    catId: id,
    buildingId: id,
  }),
  z.strictObject({
    type: z.literal('TRAVEL_TO_FISHING_SPOT'),
    catId: id,
    spotId: spotIdSchema,
  }),
  z.strictObject({
    type: z.literal('REST_CAT'),
    catId: id,
  }),
  z.strictObject({
    type: z.literal('USE_CAN'),
    catId: id,
  }),
  z.strictObject({ type: z.literal('RECYCLE_TRASH') }),
  z.strictObject({
    type: z.literal('FISH_BEGIN'),
    catId: id,
    baitId: baitIdSchema,
    direction: z.number().int().min(-maxDirection).max(maxDirection),
    aimDepth: z.number().int().min(0).max(maxDepth),
    spotId: spotIdSchema,
    /** Buttons (frozen) or motion (spec 030); omitted means buttons. */
    mode: z.enum(['buttons', 'motion']).optional(),
  }),
  z.strictObject({
    type: z.literal('FISH_CAST'),
    runId: id,
    power: z.number().int().min(0).max(maxPower),
  }),
  z.strictObject({
    type: z.literal('FISH_CONTROL'),
    runId: id,
    pressed: z.boolean(),
    ticks,
  }),
  z.strictObject({
    type: z.literal('FISH_MOTION_CONTROL'),
    runId: id,
    x: z.number().int().min(0).max(100),
    y: z.number().int().min(0).max(100),
    ticks,
  }),
  z.strictObject({ type: z.literal('FISH_STRIKE'), runId: id }),
  z.strictObject({
    type: z.literal('FISH_CANCEL'),
    runId: id,
  }),
  z.strictObject({
    type: z.literal('SELL_FISH'),
    fishId: id,
  }),
  z.strictObject({
    type: z.literal('GIFT_FISH'),
    fishId: id,
    catId: id,
  }),
  z.strictObject({
    type: z.literal('BUY_BAIT'),
    baitId: z.enum(['WORM', 'SHRIMP']),
  }),
  z.strictObject({ type: z.literal('INVITE_PEPPER') }),
  z.strictObject({
    type: z.literal('ADVANCE_TIME'),
    minutes: z.number().int().min(0).max(MAX_ADVANCE_MINUTES),
  }),
  z.strictObject({
    type: z.literal('INTERACT'),
    catId: id,
    message: z.string().trim().min(1).max(MAX_TEXT),
    reply: z.string().trim().min(1).max(MAX_TEXT),
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

export type ErrorCode =
  | 'INVALID_COMMAND'
  | 'WORLD_LIMIT'
  | 'TIME_LIMIT'
  | 'INSUFFICIENT_COINS'
  | 'CAT_NOT_FOUND'
  | 'CAT_LIMIT'
  | 'CAT_RESTING'
  | 'CAT_BUSY'
  | 'STAMINA_FULL'
  | 'LOW_STAMINA'
  | 'INVALID_PLACEMENT'
  | 'NO_WALK_ROUTE'
  | 'ALREADY_AT_DESTINATION'
  | 'LAND_ALREADY_OWNED'
  | 'LAND_NOT_OWNED'
  | 'ROAD_EXISTS'
  | 'ROAD_NOT_CONNECTED'
  | 'DIRT_ROAD_REQUIRED'
  | 'NO_ROAD'
  | 'ROAD_IN_USE'
  | 'BUILDING_NOT_FOUND'
  | 'BUILDING_LIMIT'
  | 'HOME_NOT_FOUND'
  | 'HOME_FULL'
  | 'ALREADY_HOME'
  | 'SPOT_LOCKED'
  | 'TRAVEL_REQUIRED'
  | 'ALREADY_AT_SPOT'
  | 'ALREADY_FISHING'
  | 'RUN_NOT_FOUND'
  | 'CAST_NOT_READY'
  | 'MOTION_NOT_READY'
  | 'STRIKE_NOT_READY'
  | 'WRONG_INPUT_MODE'
  | 'NO_BAIT'
  | 'BAIT_LIMIT'
  | 'BAG_FULL'
  | 'FISH_NOT_FOUND'
  | 'NO_SUPPLIES'
  | 'ALREADY_INVITED';
export type CommandResult =
  { ok: true; events: GameEvent[] } | { ok: false; error: ErrorCode };
/** A dry run: whether Core would accept the command now. */
export type CheckResult = { ok: true } | { ok: false; error: ErrorCode };

/** A rule rejection; World.dispatch turns it into a failed result with no state change. */
export class CommandError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}
