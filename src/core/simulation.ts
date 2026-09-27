import { CAT_CAFE } from '../content/definitions';
import { GameClock } from './clock';
import type { GameEvent } from './commands';
import { RandomService } from './random';
import type { Position, WorldState } from './schema';

export function isAvailable(
  world: WorldState,
  position: Position,
  excludingCat?: string,
): boolean {
  const { x, y } = position;
  return (
    x >= 0 &&
    y >= 0 &&
    x < world.map.width &&
    y < world.map.height &&
    !world.buildings.some(
      (item) => item.position.x === x && item.position.y === y,
    ) &&
    !world.cats.some(
      (item) =>
        item.id !== excludingCat &&
        item.position.x === x &&
        item.position.y === y,
    )
  );
}

const distance = (a: Position, b: Position) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function simulate(
  world: WorldState,
  minutes: number,
  events: GameEvent[],
): void {
  const clock = new GameClock(world.minute);
  const rng = new RandomService(world.rngState);
  clock.advance(minutes, (minute) => {
    world.minute = minute;
    for (const building of world.buildings) {
      building.incomeProgress++;
      if (building.incomeProgress === CAT_CAFE.intervalMinutes) {
        building.incomeProgress = 0;
        world.coins += CAT_CAFE.income;
        events.push({
          type: 'IncomeGenerated',
          minute,
          entityId: building.id,
          amount: CAT_CAFE.income,
        });
      }
    }
    if (minute % 10 !== 0) return;
    for (const cat of world.cats) {
      const { x, y } = cat.position;
      let candidates = [
        { x, y: y - 1 },
        { x: x + 1, y },
        { x, y: y + 1 },
        { x: x - 1, y },
        { x, y },
      ].filter((position) => isAvailable(world, position, cat.id));
      const cafe = world.buildings[0];
      if (cafe) {
        const currentDistance = distance(cat.position, cafe.position);
        const preferred = candidates.filter(
          (position) =>
            distance(position, cafe.position) <=
            Math.max(2, currentDistance - 1),
        );
        if (preferred.length) candidates = preferred;
      }
      const target = candidates[rng.nextInt(candidates.length)]!;
      cat.currentActivity =
        target.x === x && target.y === y ? 'resting' : 'wandering';
      cat.position = target;
      events.push({
        type: 'CatMoved',
        minute,
        entityId: cat.id,
        reason: cafe ? 'near-cafe' : 'exploring',
      });
    }
  });
  world.rngState = rng.state;
}
