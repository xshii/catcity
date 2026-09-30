import type { CatDefinitionId } from '../../src/content/cats';
import { BUILDINGS, CITY_START } from '../../src/content/city';
import type { CatEntity, CommandResult, Position, World } from '../../src/core';

/** Test shorthands over World.dispatch; production code dispatches commands directly. */
export const advance = (world: World, minutes: number): CommandResult =>
  world.dispatch({ type: 'ADVANCE_TIME', minutes });
/** Game minutes until the whole city's cafes are paid next. */
export const untilPayout = (world: World): number =>
  BUILDINGS.CAT_CAFE.intervalMinutes -
  (world.getSnapshot().minute % BUILDINGS.CAT_CAFE.intervalMinutes);
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

/** An apartment on the first plot of the starter district that takes one, by row then column. */
export function buildApartment(world: World): string {
  const { min, max } = CITY_START.starterDistrict;
  for (let y = min; y <= max; y++)
    for (let x = min; x <= max; x++)
      if (
        world.dispatch({
          type: 'BUILD_BUILDING',
          buildingType: 'CAT_APARTMENT',
          position: { x, y },
        }).ok
      )
        return world.getSnapshot().buildings.at(-1)!.id;
  throw new Error('No plot of the starter district takes an apartment');
}

/**
 * A cat invited as a player invites one (spec 041 R-12): into a free bed, and when there
 * is none into a new apartment built for it first. Returns the newcomer.
 */
export function invite(
  world: World,
  definitionId: CatDefinitionId = 'PEPPER',
): CatEntity {
  const command = { type: 'INVITE_CAT', definitionId } as const;
  const check = world.check(command);
  if (!check.ok && check.error === 'NO_BED') buildApartment(world);
  const result = world.dispatch(command);
  if (!result.ok) throw new Error(`Invitation rejected: ${result.error}`);
  return world.getSnapshot().cats.at(-1)!;
}
