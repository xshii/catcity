import { MAX_CATS, WORLD_LIMIT } from './limits';
import { BOND, CARE } from '../content/care';
import { MOOD } from '../content/mood';
import { applyCity } from './city/building';
import { queueWalk } from './city/walking';
import { applyAngling } from './fishing/commands';
import { rewardBond, spendDaily } from './bond';
import { liftMood } from './mood';
import { instantiateCat, inviteCat, requireCat } from './cats';
import { neuterCat } from './family';
import { CommandError, type GameCommand, type GameEvent } from './commands';
import type { WorldState } from './schema';
import { simulate } from './simulation';
import { isWalkable } from './city/path';
import { travelToFishingSpot } from './fishing/travel';
import { petCat } from './petting';

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
    case 'REMOVE_ROAD':
    case 'ASSIGN_HOME':
      return applyCity(world, command);
    case 'TRAVEL_TO_FISHING_SPOT':
      return travelToFishingSpot(world, command);
    case 'USE_CAN':
    case 'RECYCLE_TRASH':
    case 'FISH_BEGIN':
    case 'FISH_CAST':
    case 'FISH_CONTROL':
    case 'FISH_MOTION_CONTROL':
    case 'FISH_STRIKE':
    case 'FISH_CANCEL':
    case 'SELL_FISH':
    case 'GIFT_FISH':
    case 'BUY_BAIT':
      return applyAngling(world, command);
    case 'INVITE_CAT':
      return inviteCat(world, command.definitionId);
    case 'NEUTER_CAT':
      return neuterCat(world, command.catId);
    case 'PET_CAT':
      return petCat(world, command);
    case 'ADVANCE_TIME':
      if (world.minute + command.minutes > WORLD_LIMIT)
        throw new CommandError('TIME_LIMIT');
      simulate(world, command.minutes, events);
      break;
    case 'INTERACT': {
      const cat = requireCat(world, command.catId);
      cat.memories.push({
        id: `memory-${world.nextId++}`,
        kind: 'conversation',
        minute: world.minute,
        message: command.message,
        reply: command.reply,
      });
      cat.memories = cat.memories.slice(-CARE.memoryLimit);
      const chats = spendDaily(cat.chatBond, world.minute, BOND.chatsPerDay);
      if (chats) {
        cat.chatBond = chats;
        rewardBond(cat, BOND.chat);
      }
      if (
        cat.lastChatMoodMinute === null ||
        world.minute - cat.lastChatMoodMinute >= MOOD.chatCooldownMinutes
      ) {
        liftMood(cat, MOOD.chat);
        cat.lastChatMoodMinute = world.minute;
      }
      events.push({
        type: 'ConversationRecorded',
        minute: world.minute,
        entityId: cat.id,
      });
      break;
    }
    case 'DEBUG_SPAWN_CAT':
      if (world.cats.length >= MAX_CATS) throw new CommandError('CAT_LIMIT');
      if (!isWalkable(world, command.position))
        throw new CommandError('INVALID_PLACEMENT');
      world.cats.push(
        instantiateCat('MOCHI', `cat-${world.nextId++}`, command.position),
      );
      events.push({ type: 'DebugChanged', minute: world.minute });
      break;
  }
  return events;
}
