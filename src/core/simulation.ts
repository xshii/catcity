import { MAX_STAT, WORLD_LIMIT } from './limits';
import { CARE } from '../content/care';
import { BUILDINGS } from '../content/city';
import type { GameEvent } from './commands';
import type { WorldState } from './schema';
import { advanceWalking, resumeWalk } from './city/walking';

export function simulate(
  world: WorldState,
  minutes: number,
  events: GameEvent[],
): void {
  // One minute at a time, so a single long advance equals many short ones.
  for (let step = 0; step < minutes; step++) {
    const minute = ++world.minute;
    for (const building of world.buildings) {
      const definition = BUILDINGS[building.type];
      // Income derives from build time; moving a building keeps its clock.
      const elapsed = minute - building.builtAtMinute;
      if (elapsed % definition.intervalMinutes === 0) {
        // Income stops at the coin limit instead of rejecting the clock.
        const amount = Math.min(definition.income, WORLD_LIMIT - world.coins);
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
    for (const cat of world.cats) {
      if (!cat.rest) continue;
      if ((minute - cat.rest.startedAt) % CARE.rest.tickMinutes === 0) {
        const home = world.buildings.find(
          (building) =>
            building.id === cat.home && building.type === 'CAT_APARTMENT',
        );
        const nearHome =
          home &&
          Math.abs(cat.position.x - home.position.x) +
            Math.abs(cat.position.y - home.position.y) ===
            1;
        const before = cat.needs.energy;
        cat.needs.energy = Math.min(
          MAX_STAT,
          before + (nearHome ? CARE.rest.homeRecovery : CARE.rest.recovery),
        );
        if (cat.needs.energy > before)
          events.push({ type: 'EnergyRecovered', minute, entityId: cat.id });
      }
      if (minute === cat.rest.startedAt + CARE.rest.minutes) {
        cat.rest = null;
        events.push({ type: 'CatRestFinished', minute, entityId: cat.id });
        resumeWalk(world, cat);
      }
    }
    advanceWalking(world, events);
  }
}
