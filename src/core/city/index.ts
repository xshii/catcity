/** Read-only city queries for adapters. Mutations use World.dispatch. */
export {
  gridDistance,
  onShore,
  samePosition,
  shoreTiles,
  spotAt,
  tileAt,
} from './map';
export { cafeAssignment, nextBuildingPrice } from './customers';
export { touchesNetwork } from './path';
export type { CityMap, CityTile, Terrain } from './map';
export { walkingMinutes } from './path';
export { walkMinutes } from './walking';
