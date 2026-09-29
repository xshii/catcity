import { CAFE } from '../../content/city';
import { gridDistance } from './map';
import type { BuildingEntity, CatEntity, WorldState } from '../schema';

/** Building ids are allocated in order, so the smaller number is the older building. */
const age = (building: BuildingEntity) =>
  Number(building.id.slice(building.id.indexOf('-') + 1));

/** The one cafe a cat visits: the nearest within range of its home, the older on a tie. */
function cafeOf(world: WorldState, cat: CatEntity): BuildingEntity | undefined {
  const home = world.buildings.find((building) => building.id === cat.home);
  if (!home) return undefined;
  return world.buildings
    .filter(
      (building) =>
        building.type === 'CAT_CAFE' &&
        gridDistance(building.position, home.position) <= CAFE.range,
    )
    .sort(
      (a, b) =>
        gridDistance(a.position, home.position) -
          gridDistance(b.position, home.position) || age(a) - age(b),
    )[0];
}

/** The cats a cafe earns from now, in world order; cats beyond its seats are not served. */
export function cafeCustomers(world: WorldState, cafeId: string): CatEntity[] {
  return world.cats
    .filter((cat) => cafeOf(world, cat)?.id === cafeId)
    .slice(0, CAFE.seats);
}
