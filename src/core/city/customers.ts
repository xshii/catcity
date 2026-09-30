import { BUILDINGS, buildingPrice, CAFE } from '../../content/city';
import { gridDistance } from './map';
import type { BuildingEntity, CatEntity, WorldState } from '../schema';

/**
 * Ids are allocated in order: the smaller number is the older entity; Mochi came first.
 * Residents are numbered apart, in the order they came (`resident-n`).
 */
const age = (entity: { id: string }) =>
  Number(entity.id.slice(entity.id.indexOf('-') + 1)) || 0;

/** Who sits in a cafe: a companion with a home, or a resident of a lodge (spec 041 R-43). */
export type Customer = CatEntity | WorldState['residents'][number];

/**
 * Every cafe's customers now (spec 040), keyed by cafe id. Companions take their seats in
 * the order of their ids, then residents in the order of theirs (spec 041 design 6.4):
 * each goes to the nearest cafe within range of its home that still has a free seat, the
 * older cafe on a tie. A cat without a home, or with no free seat in range, is nobody's
 * customer; no one is counted twice.
 */
export function cafeAssignment(world: WorldState): Map<string, Customer[]> {
  const cafes = world.buildings.filter(
    (building) => building.type === 'CAT_CAFE',
  );
  const seated = new Map<string, Customer[]>(
    cafes.map((cafe) => [cafe.id, []]),
  );
  const byAge = (a: { id: string }, b: { id: string }) => age(a) - age(b);
  const queue: Customer[] = [
    ...[...world.cats].sort(byAge),
    ...[...world.residents].sort(byAge),
  ];
  for (const customer of queue) {
    const home = world.buildings.find(
      (building) => building.id === customer.home,
    );
    if (!home) continue;
    const distance = (cafe: BuildingEntity) =>
      gridDistance(cafe.position, home.position);
    const cafe = cafes
      .filter(
        (item) =>
          distance(item) <= CAFE.range &&
          seated.get(item.id)!.length < CAFE.seats,
      )
      .sort((a, b) => distance(a) - distance(b) || byAge(a, b))[0];
    if (cafe) seated.get(cafe.id)!.push(customer);
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
