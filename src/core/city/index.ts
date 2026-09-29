/** Read-only city queries for adapters. Mutations use World.dispatch. */
export {
  gridDistance,
  onShore,
  samePosition,
  shoreTiles,
  spotAt,
  tileAt,
} from './map';
export { cafeCustomers } from './customers';
export type { CityMap, CityTile, Terrain } from './map';
