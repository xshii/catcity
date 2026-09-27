import { CAT_CAFE, instantiateMochi } from '../content/definitions';
import { CommandError, type GameCommand, type GameEvent } from './commands';
import type { WorldState } from './schema';
import { isAvailable, simulate } from './simulation';

export function applyCommand(
  world: WorldState,
  command: GameCommand,
): GameEvent[] {
  const events: GameEvent[] = [];
  switch (command.type) {
    case 'BUILD_CAFE': {
      if (!isAvailable(world, command.position))
        throw new CommandError('INVALID_PLACEMENT');
      if (world.buildings.length) throw new CommandError('BUILDING_LIMIT');
      if (world.coins < CAT_CAFE.cost)
        throw new CommandError('INSUFFICIENT_COINS');
      const id = `building-${world.nextId++}`;
      world.buildings.push({
        id,
        type: CAT_CAFE.type,
        position: command.position,
        builtAtMinute: world.minute,
        incomeProgress: 0,
      });
      world.coins -= CAT_CAFE.cost;
      events.push({
        type: 'BuildingBuilt',
        entityId: id,
        minute: world.minute,
        cost: CAT_CAFE.cost,
      });
      break;
    }
    case 'ADVANCE_TIME':
      if (world.minute + command.minutes > 1_000_000_000)
        throw new CommandError('TIME_LIMIT');
      simulate(world, command.minutes, events);
      break;
    case 'INTERACT': {
      const cat = world.cats.find((item) => item.id === command.catId);
      if (!cat) throw new CommandError('CAT_NOT_FOUND');
      cat.memories.push({
        id: `memory-${world.nextId++}`,
        kind: 'conversation',
        minute: world.minute,
        message: command.message,
        reply: command.reply,
      });
      cat.memories = cat.memories.slice(-50);
      if (
        cat.lastBondMinute === null ||
        world.minute - cat.lastBondMinute >= 60
      ) {
        cat.playerBond = Math.min(100, cat.playerBond + 1);
        cat.lastBondMinute = world.minute;
      }
      cat.currentActivity = 'chatting';
      events.push({
        type: 'ConversationRecorded',
        minute: world.minute,
        entityId: cat.id,
      });
      break;
    }
    case 'DEBUG_ADD_COINS':
      world.coins += command.amount;
      events.push({ type: 'DebugChanged', minute: world.minute });
      break;
    case 'DEBUG_SPAWN_CAT':
      if (world.cats.length >= 16) throw new CommandError('CAT_LIMIT');
      if (!isAvailable(world, command.position))
        throw new CommandError('INVALID_PLACEMENT');
      world.cats.push(
        instantiateMochi(`cat-${world.nextId++}`, command.position),
      );
      events.push({ type: 'DebugChanged', minute: world.minute });
      break;
  }
  return events;
}
