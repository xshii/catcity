import { MAX_STAT, WORLD_LIMIT } from './limits';
import { CARE } from '../content/care';
import { MOOD, moodRest } from '../content/mood';
import { BUILDINGS, CAFE } from '../content/city';
import type { GameEvent } from './commands';
import type { CatEntity, WorldState } from './schema';
import { advanceWalking, resumeWalk } from './city/walking';
import { catIdle } from './cats';
import { gridDistance } from './city/map';
import { cafeCustomers } from './city/customers';

export function simulate(
  world: WorldState,
  minutes: number,
  events: GameEvent[],
): void {
  // One minute at a time, so a single long advance equals many short ones.
  for (let step = 0; step < minutes; step++) {
    const minute = ++world.minute;
    for (const building of world.buildings) {
      if (building.type !== 'CAT_CAFE') continue;
      // Income derives from build time; moving a building keeps its clock.
      const elapsed = minute - building.builtAtMinute;
      if (elapsed % BUILDINGS.CAT_CAFE.intervalMinutes === 0) {
        // Customers are counted when the hour is up; a cafe without any earns nothing.
        // Income stops at the coin limit instead of rejecting the clock.
        const amount = Math.min(
          cafeCustomers(world, building.id).length * CAFE.coinsPerCustomer,
          WORLD_LIMIT - world.coins,
        );
        if (amount > 0) {
          world.coins += amount;
          events.push({
            type: 'IncomeGenerated',
            minute,
            entityId: building.id,
            amount,
          });
        }
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
