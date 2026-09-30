import { BUILDINGS, buildingPrice, CAFE } from '../../content/city';
import { gridDistance } from './map';
import type { BuildingEntity, CatEntity, WorldState } from '../schema';

/** Ids are allocated in order: the smaller number is the older entity; Mochi came first. */
const age = (entity: { id: string }) =>
  Number(entity.id.slice(entity.id.indexOf('-') + 1)) || 0;

/**
 * Every cafe's customers now (spec 040), keyed by cafe id. Cats take their seats in the
 * order of their ids: each goes to the nearest cafe within range of its home that still
 * has a free seat, the older cafe on a tie. A cat without a home, or with no free seat in
 * range, is nobody's customer; no cat is counted twice.
 */
export function cafeAssignment(world: WorldState): Map<string, CatEntity[]> {
  const cafes = world.buildings.filter(
    (building) => building.type === 'CAT_CAFE',
  );
  const seated = new Map<string, CatEntity[]>(
    cafes.map((cafe) => [cafe.id, []]),
  );
  for (const cat of [...world.cats].sort((a, b) => age(a) - age(b))) {
    const home = world.buildings.find((building) => building.id === cat.home);
    if (!home) continue;
    const distance = (cafe: BuildingEntity) =>
      gridDistance(cafe.position, home.position);
    const cafe = cafes
      .filter(
        (item) =>
          distance(item) <= CAFE.range &&
          seated.get(item.id)!.length < CAFE.seats,
      )
      .sort((a, b) => distance(a) - distance(b) || age(a) - age(b))[0];
    if (cafe) seated.get(cafe.id)!.push(cat);
  }
  return seated;
}

/** What one more building of the type costs now: the price rises with each one standing. */
export const nextBuildingPrice = (
  world: WorldState,
  type: keyof typeof BUILDINGS,
): number =>
  buildingPrice(
    type,
    world.buildings.filter((building) => building.type === type).length,
  );
