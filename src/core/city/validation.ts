import { BUILDINGS, CITY_START, WALK_MINUTES } from '../../content/city';

const SLOWEST_STEP = Math.max(...Object.values(WALK_MINUTES));
import { SPOT_IDS, spotOpen } from '../../content/fishing';
import { onShore, samePosition, shoreTiles, tileAt } from './map';
import { connectedRoads, neighbors } from './path';
import type { Position, WorldState } from '../schema';

export function assertCity(world: WorldState): void {
  for (const [index, tile] of world.map.tiles.entries()) {
    if (
      tile.position.x !== index % CITY_START.size ||
      tile.position.y !== Math.floor(index / CITY_START.size) ||
      (tile.terrain !== 'GRASS' && (tile.owned || tile.road)) ||
      (tile.road && !tile.owned)
    )
      throw new Error('Invalid city tile');
  }
  for (const spot of SPOT_IDS)
    if (!shoreTiles(world.map, spot).length)
      throw new Error('Missing water area');
  const grass = world.map.tiles.filter((tile) => tile.terrain === 'GRASS');
  const pending: Position[] = [{ ...CITY_START.crossroads }];
  const reached = new Set<number>();
  while (pending.length) {
    const position = pending.shift()!;
    const tile = tileAt(world.map, position);
    if (!tile || tile.terrain !== 'GRASS') continue;
    const index = position.y * CITY_START.size + position.x;
    if (reached.has(index)) continue;
    reached.add(index);
    pending.push(...neighbors(position));
  }
  if (reached.size !== grass.length) throw new Error('Disconnected city land');
  const connected = connectedRoads(world);
  if (!connected.length) throw new Error('Missing starting road');
  for (const building of world.buildings) {
    const tile = tileAt(world.map, building.position)!;
    if (
      tile.terrain !== 'GRASS' ||
      !tile.owned ||
      tile.road ||
      !neighbors(building.position).some((p) =>
        connected.some((road) => samePosition(p, road)),
      )
    )
      throw new Error('Invalid building land/road');
    if (
      world.cats.filter((cat) => cat.home === building.id).length >
      BUILDINGS[building.type].homeCapacity
    )
      throw new Error('Invalid home capacity');
  }
  for (const cat of world.cats) {
    if (tileAt(world.map, cat.position)?.terrain !== 'GRASS')
      throw new Error('Cat in water');
    if (
      cat.home &&
      world.buildings.find((building) => building.id === cat.home)?.type !==
        'CAT_APARTMENT'
    )
      throw new Error('Invalid cat home');
    if (
      cat.fishingSpotId &&
      (cat.walk || !onShore(world.map, cat.fishingSpotId, cat.position))
    )
      throw new Error('Invalid cat fishing location');
    const activeSpot =
      world.fishing.active?.catId === cat.id
        ? world.fishing.active.spotId
        : null;
    if (
      activeSpot &&
      (cat.walk || !onShore(world.map, activeSpot, cat.position))
    )
      throw new Error('Fishing away from shore');
    const walk = cat.walk;
    if (!walk) continue;
    if (
      world.fishing.active?.catId === cat.id ||
      !samePosition(walk.route.at(-1)!, walk.destination)
    )
      throw new Error('Invalid cat walk');
    if (
      cat.rest || !cat.needs.energy
        ? walk.nextStepMinute !== null
        : walk.nextStepMinute === null ||
          walk.nextStepMinute <= world.minute ||
          walk.nextStepMinute > world.minute + SLOWEST_STEP
    )
      throw new Error('Invalid walk clock');
    if (
      walk.spotId &&
      (!spotOpen(walk.spotId, world.fishing) ||
        !onShore(world.map, walk.spotId, walk.destination))
    )
      throw new Error('Invalid walk fishing destination');
    let previous = cat.position;
    const seen = new Set<string>([`${previous.x},${previous.y}`]);
    for (const position of walk.route) {
      const key = `${position.x},${position.y}`;
      if (
        Math.abs(previous.x - position.x) +
          Math.abs(previous.y - position.y) !==
          1 ||
        tileAt(world.map, position)?.terrain !== 'GRASS' ||
        world.buildings.some((building) =>
          samePosition(building.position, position),
        ) ||
        seen.has(key)
      )
        throw new Error('Invalid walk route');
      previous = position;
      seen.add(key);
    }
  }
}
