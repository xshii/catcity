import { spotOpen, type SpotId } from '../../content/fishing';
import { CommandError, type GameCommand, type GameEvent } from '../commands';
import { shoreTiles } from '../city/map';
import { findWalkingPath, routeMinutes } from '../city/path';
import { atFishingShore, queueWalk } from '../city/walking';
import type { CatEntity, Position, WorldState } from '../schema';
import { requireCat } from '../cats';

/** Queue a real route to the nearest reachable shore; only the clock moves cats. */
export function travelToFishingSpot(
  world: WorldState,
  command: Extract<GameCommand, { type: 'TRAVEL_TO_FISHING_SPOT' }>,
): GameEvent[] {
  const cat = requireCat(world, command.catId);
  if (world.fishing.active?.catId === cat.id)
    throw new CommandError('ALREADY_FISHING');
  if (!spotOpen(command.spotId, world.fishing))
    throw new CommandError('SPOT_LOCKED');
  if (atFishingShore(world, cat, command.spotId))
    throw new CommandError('ALREADY_AT_SPOT');
  const nearest = nearestShore(world, cat, command.spotId);
  if (!nearest) throw new CommandError('NO_WALK_ROUTE');
  return queueWalk(world, cat.id, nearest.destination, command.spotId);
}

/** The shore tile of the spot that takes the cat the fewest minutes to reach. */
function nearestShore(world: WorldState, cat: CatEntity, spotId: SpotId) {
  const routes = shoreTiles(world.map, spotId)
    .map((destination) => ({
      destination,
      route: findWalkingPath(world, cat.id, destination) ?? [],
    }))
    .filter((entry) => entry.route.length);
  const cost = (route: Position[]) => routeMinutes(world, route);
  routes.sort(
    (a, b) =>
      cost(a.route) - cost(b.route) ||
      a.destination.y - b.destination.y ||
      a.destination.x - b.destination.x,
  );
  return routes[0] ?? null;
}

/** Game minutes the walk `TRAVEL_TO_FISHING_SPOT` would queue takes; null without one. */
export function travelMinutes(
  world: WorldState,
  catId: string,
  spotId: SpotId,
): number | null {
  const cat = world.cats.find((item) => item.id === catId);
  if (!cat || atFishingShore(world, cat, spotId)) return null;
  const nearest = nearestShore(world, cat, spotId);
  return nearest && routeMinutes(world, nearest.route);
}
