import { BUILDINGS } from '../content/city';
import { GameClock } from './clock';
import type { GameEvent } from './commands';
import type { WorldState } from './schema';
import { advanceWalking, resumeWalk } from './city/walking';

export function simulate(
  world: WorldState,
  minutes: number,
  events: GameEvent[],
): void {
  const clock = new GameClock(world.minute);
  clock.advance(minutes, (minute) => {
    world.minute = minute;
    for (const building of world.buildings) {
      const definition = BUILDINGS[building.type];
      building.incomeProgress++;
      if (building.incomeProgress === definition.intervalMinutes) {
        building.incomeProgress = 0;
        if (definition.income) {
          world.coins += definition.income;
          events.push({
            type: 'IncomeGenerated',
            minute,
            entityId: building.id,
            amount: definition.income,
          });
        }
      }
    }
    for (const cat of world.cats) {
      if (!cat.rest) continue;
      if ((minute - cat.rest.startedAt) % 10 === 0) {
        const home = world.buildings.find(
          (building) =>
            building.id === cat.home && building.type === 'CAT_APARTMENT',
        );
        const nearHome =
          home &&
          Math.abs(cat.position.x - home.position.x) +
            Math.abs(cat.position.y - home.position.y) ===
            1;
        cat.needs.energy = Math.min(
          100,
          cat.needs.energy + (nearHome ? 10 : 5),
        );
        events.push({ type: 'EnergyRecovered', minute, entityId: cat.id });
      }
      if (minute === cat.rest.until) {
        cat.rest = null;
        events.push({ type: 'CatRestFinished', minute, entityId: cat.id });
        resumeWalk(world, cat);
      }
    }
    advanceWalking(world, events);
  });
}
