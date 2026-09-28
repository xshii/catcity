import { WALK_MINUTES } from '../../content/city';
import { samePosition, tileAt } from './map';
import type { Position, WorldState } from '../schema';

export const neighbors = ({ x, y }: Position): Position[] => [
  { x, y: y - 1 },
  { x: x + 1, y },
  { x, y: y + 1 },
  { x: x - 1, y },
];
const key = (position: Position) => position.y * 10 + position.x;

export function isWalkable(
  world: WorldState,
  position: Position,
  excludingCat?: string,
): boolean {
  return (
    tileAt(world.map, position)?.terrain === 'GRASS' &&
    !world.buildings.some((building) =>
      samePosition(building.position, position),
    ) &&
    !world.cats.some(
      (cat) => cat.id !== excludingCat && samePosition(cat.position, position),
    )
  );
}

export function walkingMinutes(world: WorldState, position: Position): number {
  return WALK_MINUTES[tileAt(world.map, position)?.road ?? 'GRASS'];
}

/** At most 100 nodes: stable Dijkstra ordering favors actual travel time. */
export function findWalkingPath(
  world: WorldState,
  catId: string,
  destination: Position,
): Position[] | null {
  const cat = world.cats.find((cat) => cat.id === catId);
  if (!cat || !isWalkable(world, destination, catId)) return null;
  const open = [{ position: cat.position, cost: 0, route: [] as Position[] }];
  const visited = new Set<number>();
  while (open.length) {
    open.sort((a, b) => a.cost - b.cost || key(a.position) - key(b.position));
    const next = open.shift()!;
    if (visited.has(key(next.position))) continue;
    visited.add(key(next.position));
    if (samePosition(next.position, destination)) return next.route;
    for (const position of neighbors(next.position)) {
      if (!visited.has(key(position)) && isWalkable(world, position, catId))
        open.push({
          position,
          cost: next.cost + walkingMinutes(world, position),
          route: [...next.route, position],
        });
    }
  }
  return null;
}

/** Only the road component connected to the starting crossroads supplies buildings. */
export function connectedRoads(world: WorldState): Position[] {
  const queue = [{ x: 5, y: 5 }];
  const visited = new Set<number>();
  const result: Position[] = [];
  while (queue.length) {
    const position = queue.shift()!;
    if (visited.has(key(position)) || !tileAt(world.map, position)?.road)
      continue;
    visited.add(key(position));
    result.push(position);
    queue.push(...neighbors(position));
  }
  return result;
}

/** Shortest owned land connection, planned before any building/road is committed. */
export function roadConnectionPath(
  world: WorldState,
  buildingPosition: Position,
): Position[] | null {
  const connected = new Set(connectedRoads(world).map(key));
  const open = neighbors(buildingPosition).map((position) => [position]);
  const visited = new Set<number>();
  while (open.length) {
    const route = open.shift()!;
    const position = route.at(-1)!;
    const tile = tileAt(world.map, position);
    if (
      !tile ||
      visited.has(key(position)) ||
      !tile.owned ||
      tile.terrain !== 'GRASS' ||
      samePosition(position, buildingPosition) ||
      world.buildings.some((building) =>
        samePosition(building.position, position),
      )
    )
      continue;
    visited.add(key(position));
    if (connected.has(key(position))) return route;
    for (const next of neighbors(position)) open.push([...route, next]);
  }
  return null;
}
