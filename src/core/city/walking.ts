import { CARE } from '../../content/care';
import { MOOD } from '../../content/mood';
import { WORLD_LIMIT } from '../limits';
import { SPOT_IDS, spotOpen, type SpotId } from '../../content/fishing';
import { onShore, samePosition } from './map';
import { findWalkingPath, isWalkable, walkingMinutes } from './path';
import { CommandError, type GameEvent } from '../commands';
import type { CatEntity, Position, WorldState } from '../schema';
import { requireCat } from '../cats';

export function atFishingShore(
  world: WorldState,
  cat: CatEntity,
  spot: SpotId,
): boolean {
  return !cat.walk && onShore(world.map, spot, cat.position);
}

function reachedSpot(world: WorldState, cat: CatEntity): SpotId | null {
  return (
    SPOT_IDS.find(
      (spot) =>
        spotOpen(spot, world.fishing) && atFishingShore(world, cat, spot),
    ) ?? null
  );
}

export function resumeWalk(world: WorldState, cat: CatEntity): void {
  if (!cat.walk || cat.needs.energy === 0 || cat.walk.nextStepMinute !== null)
    return;
  const minute = world.minute + walkingMinutes(world, cat.walk.route[0]!);
  if (minute > WORLD_LIMIT) throw new CommandError('TIME_LIMIT');
  cat.walk.nextStepMinute = minute;
}

export function queueWalk(
  world: WorldState,
  catId: string,
  destination: Position,
  spotId: SpotId | null = null,
): GameEvent[] {
  const cat = requireCat(world, catId);
  if (world.fishing.active?.catId === catId) throw new CommandError('CAT_BUSY');
  if (samePosition(cat.position, destination))
    throw new CommandError('ALREADY_AT_DESTINATION');
  const route = findWalkingPath(world, catId, destination);
  if (!route?.length) throw new CommandError('NO_WALK_ROUTE');
  if (
    world.minute +
      route.reduce(
        (sum, position) => sum + walkingMinutes(world, position),
        0,
      ) >
    WORLD_LIMIT
  )
    throw new CommandError('TIME_LIMIT');
  cat.walk = { destination, route, nextStepMinute: null, spotId };
  cat.fishingSpotId = null;
  resumeWalk(world, cat);
  return [{ type: 'WalkStarted', minute: world.minute, entityId: cat.id }];
}

/** Replan after construction/occupancy changes; never keep a route through a building. */
export function replanWalk(
  world: WorldState,
  cat: CatEntity,
  events: GameEvent[],
): void {
  if (!cat.walk) return;
  const route = findWalkingPath(world, cat.id, cat.walk.destination);
  if (!route?.length) {
    cat.walk = null;
    events.push({
      type: 'WalkBlocked',
      minute: world.minute,
      entityId: cat.id,
    });
    return;
  }
  cat.walk.route = route;
  cat.walk.nextStepMinute = null;
  resumeWalk(world, cat);
}

export function advanceWalking(world: WorldState, events: GameEvent[]): void {
  for (const cat of world.cats) {
    const walk = cat.walk;
    if (
      !walk ||
      walk.nextStepMinute === null ||
      walk.nextStepMinute > world.minute
    )
      continue;
    const target = walk.route[0]!;
    if (!isWalkable(world, target, cat.id)) {
      replanWalk(world, cat, events);
      continue;
    }
    cat.position = walk.route.shift()!;
    cat.needs.energy -= CARE.walkEnergyPerTile;
    if (cat.needs.energy === 0)
      cat.mood = Math.max(0, cat.mood - MOOD.exhausted);
    events.push({
      type: 'CatMoved',
      minute: world.minute,
      entityId: cat.id,
      reason: 'walking',
    });
    if (!walk.route.length) {
      cat.walk = null;
      cat.fishingSpotId = walk.spotId ?? reachedSpot(world, cat);
      events.push({
        type: 'WalkFinished',
        minute: world.minute,
        entityId: cat.id,
      });
      if (cat.fishingSpotId)
        events.push({
          type: 'FishingSpotReached',
          minute: world.minute,
          entityId: cat.id,
          from: null,
          spotId: cat.fishingSpotId,
          minutes: 0,
        });
    } else {
      walk.nextStepMinute = null;
      resumeWalk(world, cat);
    }
  }
}
