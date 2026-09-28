import { CITY_START } from '../../content/city';
import type { SpotId } from '../../content/fishing';
import { RandomService, streamSeed } from '../random';

export interface Position {
  x: number;
  y: number;
}
export type Terrain = 'GRASS' | 'POND' | 'RIVER' | 'LAKE' | 'SEA';
export interface CityTile {
  position: Position;
  terrain: Terrain;
  owned: boolean;
  road: 'DIRT' | 'STONE' | null;
}
export interface CityMap {
  width: typeof CITY_START.size;
  height: typeof CITY_START.size;
  generationVersion: 1;
  tiles: CityTile[];
}
const waterSpots: Partial<Record<Terrain, SpotId>> = {
  POND: 'POND',
  RIVER: 'REEDS',
  LAKE: 'MOON',
  SEA: 'COAST',
};
export const samePosition = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;
export function tileAt(map: CityMap, position: Position): CityTile | undefined {
  const { x, y } = position;
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= map.width ||
    y >= map.height
  )
    return undefined;
  return map.tiles[y * map.width + x];
}
export function spotAt(map: CityMap, position: Position): SpotId | null {
  const tile = tileAt(map, position);
  return tile ? (waterSpots[tile.terrain] ?? null) : null;
}
export const onShore = (map: CityMap, spot: SpotId, position: Position) =>
  shoreTiles(map, spot).some((shore) => samePosition(shore, position));
export function shoreTiles(map: CityMap, spot: SpotId): Position[] {
  return map.tiles
    .filter((tile) => {
      if (tile.terrain !== 'GRASS') return false;
      const { x, y } = tile.position;
      return [
        { x, y: y - 1 },
        { x: x + 1, y },
        { x, y: y + 1 },
        { x: x - 1, y },
      ].some((position) => spotAt(map, position) === spot);
    })
    .map((tile) => ({ ...tile.position }));
}

const SIZE = CITY_START.size;
const CROSSROADS = CITY_START.crossroads;
const inDistrict = (value: number) =>
  value >= CITY_START.starterDistrict.min &&
  value <= CITY_START.starterDistrict.max;

/** Bounded templates guarantee connected land; this stream never consumes gameplay RNG. */
export function generateCityMap(seed: number): CityMap {
  const rng = new RandomService(streamSeed(seed, 'map'));
  const map: CityMap = {
    width: SIZE,
    height: SIZE,
    generationVersion: 1,
    tiles: Array.from({ length: SIZE * SIZE }, (_, index) => {
      const x = index % SIZE;
      const y = Math.floor(index / SIZE);
      const owned = inDistrict(x) && inDistrict(y);
      return {
        position: { x, y },
        terrain: 'GRASS',
        owned,
        road:
          owned && (x === CROSSROADS.x || y === CROSSROADS.y) ? 'DIRT' : null,
      };
    }),
  };
  const water = (x: number, y: number, terrain: Terrain) => {
    const tile = tileAt(map, { x, y })!;
    tile.terrain = terrain;
    tile.owned = false;
    tile.road = null;
  };
  // One connected river runs north–south. Variable banks remain outside starter land.
  for (let y = 0; y < 10; y++) {
    water(0, y, 'RIVER');
    if (rng.nextInt(3) !== 0) water(1, y, 'RIVER');
  }
  const pondY = 2 + rng.nextInt(3);
  for (let y = pondY; y < pondY + 2; y++)
    for (let x = 7; x <= 8; x++) water(x, y, 'POND');
  const extension = rng.nextInt(3);
  for (let x = 7; x < 7 + extension; x++) water(x, pondY + 2, 'POND');
  // Keep the existing advanced fishing destinations; their skill/discovery gates still apply.
  const lakeX = 3 + rng.nextInt(2);
  for (let y = 0; y <= 1; y++)
    for (let x = lakeX; x < lakeX + 2; x++) water(x, y, 'LAKE');
  for (let y = 7; y < 10; y++) {
    water(9, y, 'SEA');
    if (y > 7 || rng.nextInt(2) === 1) water(8, y, 'SEA');
  }
  return map;
}
