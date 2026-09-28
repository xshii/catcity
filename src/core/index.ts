/** Public world API. Systems and state validators remain inside Core. */
export { createWorld, loadWorld, World } from './world';
export { commandSchema } from './commands';
export type { GameCommand, CommandResult } from './commands';
export type { WorldState, CatEntity, BuildingEntity, Position } from './schema';
