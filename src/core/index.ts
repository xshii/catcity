/** Public world API. Systems and state validators remain inside Core. */
export { createWorld, loadWorld, World } from './world';
export { commandSchema } from './commands';
export { MAX_BOND, MAX_STAT, MAX_TEXT } from './limits';
export { catIdle, freeBeds, nextInvitePrice } from './cats';
export { gameDay } from './bond';
export { pettingTastes } from './petting';
export { travelMinutes } from './fishing/travel';
export { fishShadows, shadowUnderCast } from './fishing/shadows';
export type { FishShadow } from './fishing/shadows';
export type {
  GameCommand,
  CommandResult,
  CheckResult,
  ErrorCode,
} from './commands';
export type { WorldState, CatEntity, BuildingEntity, Position } from './schema';
