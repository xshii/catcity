import { MAX_STAT, WORLD_LIMIT } from './limits';
import { CARE } from '../content/care';
import { MOOD, moodRest } from '../content/mood';
import { BUILDINGS, CAFE } from '../content/city';
import type { GameEvent } from './commands';
import type { CatEntity, WorldState } from './schema';
import { advanceWalking, resumeWalk } from './city/walking';
import { catIdle } from './cats';
import { gridDistance } from './city/map';
import { cafeAssignment } from './city/customers';

export function simulate(
  world: WorldState,
  minutes: number,
  events: GameEvent[],
): void {
  // One minute at a time, so a single long advance equals many short ones.
  for (let step = 0; step < minutes; step++) {
    const minute = ++world.minute;
    // The whole city is paid at the same minutes from one seating of the cats, so no
    // cat pays two cafes in one interval, whatever was moved in between.
    if (minute % BUILDINGS.CAT_CAFE.intervalMinutes === 0)
      for (const [cafeId, customers] of cafeAssignment(world)) {
        // Income stops at the coin limit instead of rejecting the clock.
        const amount = Math.min(
          customers.length * CAFE.coinsPerCustomer,
          WORLD_LIMIT - world.coins,
        );
        if (amount > 0) {
          world.coins += amount;
          events.push({
            type: 'IncomeGenerated',
            minute,
            entityId: cafeId,
            amount,
          });
        }
      }
    if (minute % CARE.recovery.tickMinutes === 0)
      for (const cat of world.cats) {
        if (!catIdle(world, cat)) continue;
        const before = cat.needs.energy;
        cat.needs.energy = Math.min(
          MAX_STAT,
          before +
            (nearHome(world, cat) ? CARE.recovery.home : CARE.recovery.idle),
        );
        if (cat.needs.energy > before) {
          events.push({ type: 'EnergyRecovered', minute, entityId: cat.id });
          resumeWalk(world, cat);
        }
      }
    if (minute % MOOD.tickMinutes === 0)
      for (const cat of world.cats) {
        const rest = moodRest(cat.playerBond);
        const toward =
          cat.mood > rest
            ? Math.max(rest, cat.mood - MOOD.drift)
            : Math.min(rest, cat.mood + MOOD.drift);
        cat.mood = Math.min(
          MAX_STAT,
          toward + (nearHome(world, cat) ? MOOD.home : 0),
        );
      }
    advanceWalking(world, events);
  }
}

function nearHome(world: WorldState, cat: CatEntity): boolean {
  const home = world.buildings.find(
    (building) => building.id === cat.home && building.type === 'CAT_APARTMENT',
  );
  return !!home && gridDistance(cat.position, home.position) === 1;
}
