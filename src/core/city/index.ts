/** Read-only city queries for adapters. Mutations use World.dispatch. */
export { onShore, samePosition, shoreTiles, spotAt, tileAt } from './map';
export type { CityMap, CityTile, Terrain } from './map';
export { walkingMinutes } from './path';
export { walkMinutes } from './walking';
