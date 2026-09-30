import { CAT_BREED_IDS, type CatBreed } from '../content/breeds';
import { APPEARANCE_OPTIONS, type CatAppearance } from '../content/cats';
import { BUILDINGS } from '../content/city';
import {
  ARRIVAL_MINUTES,
  MAX_RESIDENTS,
  RESIDENT_NAMES,
} from '../content/residents';
import type { GameEvent } from './commands';
import { RandomService, runSeed, streamSeed } from './random';
import type { BuildingEntity, WorldState } from './schema';

/**
 * Residents are numbered in the order they came, from 1: the order is a saved fact, so
 * a number is never reused and the n-th resident takes the n-th name of its city.
 */
const PREFIX = 'resident-';
const residentId = (serial: number) => `${PREFIX}${serial}`;
const serialOf = (id: string) => Number(id.slice(PREFIX.length));

/**
 * Who a resident is (spec 041 R-42, design 6.1): its name, breed, look and sex follow
 * from the world seed and its id, so none of them is saved and none ever changes.
 */
export function residentIdentity(
  seed: number,
  id: string,
): {
  name: string;
  breed: CatBreed;
  appearance: CatAppearance;
  sex: 'F' | 'M';
} {
  const stream = streamSeed(seed, 'resident');
  // The city's own order of the names, the same for all its residents.
  const names: string[] = [...RESIDENT_NAMES];
  const order = new RandomService(stream);
  for (let last = names.length - 1; last > 0; last--) {
    const other = order.nextInt(last + 1);
    [names[last], names[other]] = [names[other]!, names[last]!];
  }
  const serial = serialOf(id);
  const random = new RandomService(runSeed(stream, serial));
  const pick = <T>(items: readonly T[]): T =>
    items[random.nextInt(items.length)]!;
  return {
    name: names[(serial - 1) % names.length]!,
    breed: pick(CAT_BREED_IDS),
    appearance: {
      colour: pick(APPEARANCE_OPTIONS.colour),
      pattern: pick(APPEARANCE_OPTIONS.pattern),
      white: pick(APPEARANCE_OPTIONS.white),
      eyes: pick(APPEARANCE_OPTIONS.eyes),
      face: pick(APPEARANCE_OPTIONS.face),
    },
    sex: pick(['F', 'M'] as const),
  };
}

const lodgers = (world: WorldState, lodgeId: string) =>
  world.residents.filter((resident) => resident.home === lodgeId).length;

/**
 * Where the next resident will live: the oldest lodge with a free room, while the city
 * has room for one more resident (R-46); null when nobody is coming.
 */
export function nextResidentHome(world: WorldState): BuildingEntity | null {
  if (world.residents.length >= MAX_RESIDENTS) return null;
  return (
    world.buildings.find(
      (building) =>
        building.type === 'CAT_LODGE' &&
        lodgers(world, building.id) < BUILDINGS.CAT_LODGE.residentCapacity,
    ) ?? null
  );
}

/** As a game day starts, one resident moves in where there is room (R-41). */
export function residentArrives(world: WorldState, events: GameEvent[]): void {
  if (world.minute % ARRIVAL_MINUTES) return;
  const home = nextResidentHome(world);
  if (!home) return;
  const id = residentId(world.residents.length + 1);
  world.residents.push({ id, home: home.id, arrivedMinute: world.minute });
  events.push({ type: 'ResidentArrived', minute: world.minute, entityId: id });
}

/**
 * Only residents that could have come: numbered in the order they came, one a day at a
 * day's start, none yet to come, each in a lodge, at most four to a lodge.
 */
export function assertResidents(world: WorldState): void {
  world.residents.forEach((resident, index) => {
    const previous = world.residents[index - 1];
    const home = world.buildings.find(({ id }) => id === resident.home);
    if (
      resident.id !== residentId(index + 1) ||
      resident.arrivedMinute % ARRIVAL_MINUTES ||
      resident.arrivedMinute > world.minute ||
      (previous && resident.arrivedMinute <= previous.arrivedMinute) ||
      home?.type !== 'CAT_LODGE' ||
      lodgers(world, home.id) > BUILDINGS.CAT_LODGE.residentCapacity
    )
      throw new Error('Invalid resident');
  });
}
