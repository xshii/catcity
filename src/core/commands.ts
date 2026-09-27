import { z } from 'zod';
import { positionSchema } from './schema';

export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('BUILD_CAFE'), position: positionSchema }),
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
      reason: 'near-cafe' | 'exploring';
    }
  | { type: 'ConversationRecorded'; minute: number; entityId: string }
  | { type: 'DebugChanged'; minute: number };
export type CommandResult =
  { ok: true; events: GameEvent[] } | { ok: false; error: string };

export class CommandError extends Error {}
