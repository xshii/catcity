import { CITY_START } from '../../content/city';
import { WALK_MINUTES } from '../../content/city';
import { samePosition, tileAt } from './map';
import type { Position, WorldState } from '../schema';

export const neighbors = ({ x, y }: Position): Position[] => [
  { x, y: y - 1 },
  { x: x + 1, y },
  { x, y: y + 1 },
  { x: x - 1, y },
];
const key = (position: Position) => position.y * CITY_START.size + position.x;

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

export const routeMinutes = (world: WorldState, route: Position[]): number =>
  route.reduce((sum, position) => sum + walkingMinutes(world, position), 0);

/** At most size² nodes: stable Dijkstra ordering favors actual travel time. */
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
  const queue: Position[] = [{ ...CITY_START.crossroads }];
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

/** A building needs a neighbouring road that belongs to the crossroads network. */
export function touchesNetwork(world: WorldState, position: Position): boolean {
  const connected = connectedRoads(world);
  return neighbors(position).some((next) =>
    connected.some((road) => samePosition(road, next)),
  );
}
