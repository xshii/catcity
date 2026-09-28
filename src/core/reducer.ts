import { MAX_CATS, MAX_STAT, WORLD_LIMIT } from './limits';
import { CARE } from '../content/care';
import { applyCity } from './city/building';
import { queueWalk } from './city/walking';
import { applyAngling } from './fishing/commands';
import { rewardBond } from './bond';
import { instantiateMochi } from '../content/definitions';
import { CommandError, type GameCommand, type GameEvent } from './commands';
import type { WorldState } from './schema';
import { simulate } from './simulation';
import { isWalkable } from './city/path';
import { travelToFishingSpot } from './fishing/travel';

export function applyCommand(
  world: WorldState,
  command: GameCommand,
): GameEvent[] {
  const events: GameEvent[] = [];
  switch (command.type) {
    case 'WALK_CAT':
      return queueWalk(world, command.catId, command.destination);
    case 'BUY_LAND':
    case 'BUILD_BUILDING':
    case 'MOVE_BUILDING':
    case 'PLACE_ROAD':
    case 'UPGRADE_ROAD':
    case 'ASSIGN_HOME':
      return applyCity(world, command);
    case 'TRAVEL_TO_FISHING_SPOT':
      return travelToFishingSpot(world, command);
    case 'REST_CAT': {
      const cat = world.cats.find((item) => item.id === command.catId);
      if (!cat) throw new CommandError('CAT_NOT_FOUND');
      if (cat.rest) throw new CommandError('CAT_RESTING');
      if (world.fishing.active?.catId === cat.id)
        throw new CommandError('CAT_BUSY');
      if (cat.needs.energy === MAX_STAT) throw new CommandError('STAMINA_FULL');
      if (world.minute + CARE.rest.minutes > WORLD_LIMIT)
        throw new CommandError('TIME_LIMIT');
      cat.rest = {
        startedAt: world.minute,
        until: world.minute + CARE.rest.minutes,
      };
      cat.currentActivity = 'resting';
      if (cat.walk) cat.walk.nextStepMinute = null;
      events.push({
        type: 'CatRestStarted',
        minute: world.minute,
        entityId: cat.id,
      });
      break;
    }
    case 'USE_CAN':
    case 'RECYCLE_TRASH':
    case 'FISH_BEGIN':
    case 'FISH_CAST':
    case 'FISH_CONTROL':
    case 'FISH_MOTION_CONTROL':
    case 'FISH_CANCEL':
    case 'SELL_FISH':
    case 'GIFT_FISH':
    case 'BUY_BAIT':
    case 'INVITE_PEPPER':
      return applyAngling(world, command);
    case 'ADVANCE_TIME':
      if (world.minute + command.minutes > WORLD_LIMIT)
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
      cat.memories = cat.memories.slice(-CARE.memoryLimit);
      rewardBond(cat, world.minute);
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
      if (world.cats.length >= MAX_CATS) throw new CommandError('CAT_LIMIT');
      if (!isWalkable(world, command.position))
        throw new CommandError('INVALID_PLACEMENT');
      world.cats.push(
        instantiateMochi(`cat-${world.nextId++}`, command.position),
      );
      events.push({ type: 'DebugChanged', minute: world.minute });
      break;
  }
  return events;
}
