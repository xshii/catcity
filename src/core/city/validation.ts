import { BUILDINGS } from '../../content/city';
import { SPOT_IDS, spotUnlocked } from '../../content/fish';
import { samePosition, shoreTiles, tileAt } from './map';
import { connectedRoads, neighbors } from './path';
import type { WorldState } from '../schema';

export function assertCity(world: WorldState): void {
  for (const [index, tile] of world.map.tiles.entries()) {
    if (
      tile.position.x !== index % 10 ||
      tile.position.y !== Math.floor(index / 10) ||
      (tile.terrain !== 'GRASS' && (tile.owned || tile.road)) ||
      (tile.road && !tile.owned)
    )
      throw new Error('Invalid city tile');
  }
  for (const spot of SPOT_IDS)
    if (!shoreTiles(world.map, spot).length)
      throw new Error('Missing water area');
  const grass = world.map.tiles.filter((tile) => tile.terrain === 'GRASS');
  const pending = [{ x: 5, y: 5 }];
  const reached = new Set<number>();
  while (pending.length) {
    const position = pending.shift()!;
    const tile = tileAt(world.map, position);
    if (!tile || tile.terrain !== 'GRASS') continue;
    const index = position.y * 10 + position.x;
    if (reached.has(index)) continue;
    reached.add(index);
    pending.push(...neighbors(position));
  }
  if (reached.size !== grass.length) throw new Error('Disconnected city land');
  const discovered = Object.values(world.fishing.atlas).filter(
    (entry) => entry.count > 0,
  ).length;
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
      (cat.walk ||
        !shoreTiles(world.map, cat.fishingSpotId).some((position) =>
          samePosition(position, cat.position),
        ))
    )
      throw new Error('Invalid cat fishing location');
    const activeSpot =
      world.fishing.active?.catId === cat.id
        ? world.fishing.active.spotId
        : null;
    if (
      activeSpot &&
      (cat.walk ||
        !shoreTiles(world.map, activeSpot).some((position) =>
          samePosition(position, cat.position),
        ))
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
          walk.nextStepMinute > world.minute + 10
    )
      throw new Error('Invalid walk clock');
    if (
      walk.spotId &&
      (!spotUnlocked(walk.spotId, world.fishing.xp, discovered) ||
        !shoreTiles(world.map, walk.spotId).some((position) =>
          samePosition(position, walk.destination),
        ))
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
