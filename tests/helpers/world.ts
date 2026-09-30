import {
  INVITABLE_CATS,
  MAX_COMPANIONS,
  type CatDefinitionId,
} from '../../src/content/cats';
import { BUILDINGS, CITY_START } from '../../src/content/city';
import {
  createWorld,
  World,
  type CatEntity,
  type CommandResult,
  type Position,
} from '../../src/core';

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

/**
 * A city at the companion limit (R-13), built by commands on seed 42: Mochi, every cat
 * on the invite list, then debug copies of Mochi on grass away from the city. Coins are
 * set first so that every invitation and its apartment is paid for.
 */
export function fullCity(): World {
  const world = new World({
    ...createWorld(42).getSnapshot(),
    coins: 100_000,
  });
  for (const id of INVITABLE_CATS) invite(world, id);
  for (const position of [
    { x: 2, y: 7 },
    { x: 2, y: 8 },
    { x: 3, y: 7 },
    { x: 3, y: 8 },
  ].slice(0, MAX_COMPANIONS - world.getSnapshot().cats.length)) {
    const spawned = world.dispatch({ type: 'DEBUG_SPAWN_CAT', position });
    if (!spawned.ok) throw new Error(`Spawn rejected: ${spawned.error}`);
  }
  return world;
}
