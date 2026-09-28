import { spotOpen } from '../../content/fishing';
import { CommandError, type GameCommand, type GameEvent } from '../commands';
import { shoreTiles } from '../city/map';
import { findWalkingPath, walkingMinutes } from '../city/path';
import { atFishingShore, queueWalk } from '../city/walking';
import type { WorldState } from '../schema';

/** Queue a real route to the nearest reachable shore; only the clock moves cats. */
export function travelToFishingSpot(
  world: WorldState,
  command: Extract<GameCommand, { type: 'TRAVEL_TO_FISHING_SPOT' }>,
): GameEvent[] {
  const cat = world.cats.find((cat) => cat.id === command.catId);
  if (!cat) throw new CommandError('CAT_NOT_FOUND');
  if (world.fishing.active?.catId === cat.id)
    throw new CommandError('ALREADY_FISHING');
  if (cat.rest) throw new CommandError('CAT_RESTING');
  if (!spotOpen(command.spotId, world.fishing))
    throw new CommandError('SPOT_LOCKED');
  if (atFishingShore(world, cat, command.spotId))
    throw new CommandError('ALREADY_AT_SPOT');
  const routes = shoreTiles(world.map, command.spotId)
    .map((destination) => ({
      destination,
      route: findWalkingPath(world, cat.id, destination),
    }))
    .filter((entry) => entry.route?.length);
  const cost = (route: NonNullable<(typeof routes)[number]['route']>) =>
    route.reduce((total, p) => total + walkingMinutes(world, p), 0);
  routes.sort(
    (a, b) =>
      cost(a.route!) - cost(b.route!) ||
      a.destination.y - b.destination.y ||
      a.destination.x - b.destination.x,
  );
  if (!routes.length) throw new CommandError('NO_WALK_ROUTE');
  return queueWalk(world, cat.id, routes[0]!.destination, command.spotId);
}
