import type { CommandResult, Position, World } from '../../src/core';

/** Test shorthands over World.dispatch; production code dispatches commands directly. */
export const advance = (world: World, minutes: number): CommandResult =>
  world.dispatch({ type: 'ADVANCE_TIME', minutes });
export const buildCafe = (world: World, position: Position): CommandResult =>
  world.dispatch({
    type: 'BUILD_BUILDING',
    buildingType: 'CAT_CAFE',
    position,
  });
export const interact = (
  world: World,
  catId: string,
  message: string,
  reply: string,
): CommandResult => world.dispatch({ type: 'INTERACT', catId, message, reply });
