import { atFishingShore, resumeWalk } from '../city/walking';
import {
  BAITS,
  canCatchFish,
  fishById,
  skillLevel,
  spotUnlocked,
} from '../../content/fish';
import { instantiatePepper } from '../../content/definitions';
import {
  castAngling,
  initialAngling,
  stepAngling,
  stepMotionAngling,
} from '../../minigames/angling';
import { rewardBond } from '../bond';
import { CommandError, type GameCommand, type GameEvent } from '../commands';
import type { WorldState } from '../schema';
import { isWalkable } from '../city/path';
import { failureTrash } from './rewards';

export function applyAngling(
  world: WorldState,
  command: GameCommand,
): GameEvent[] {
  const fishing = world.fishing;
  const events: GameEvent[] = [];
  const emit = (action: string, entityId = '') =>
    events.push({
      type: 'FishingChanged',
      minute: world.minute,
      action,
      entityId,
    });
  if (command.type === 'USE_CAN' || command.type === 'RECYCLE_TRASH') {
    const key = command.type === 'USE_CAN' ? 'cans' : 'trash';
    if (!fishing.supplies[key]) throw new CommandError('NO_SUPPLIES');
    if (command.type === 'USE_CAN') {
      const cat = world.cats.find((cat) => cat.id === command.catId);
      if (!cat) throw new CommandError('CAT_NOT_FOUND');
      if (cat.needs.energy === 100) throw new CommandError('STAMINA_FULL');
      cat.needs.energy = Math.min(100, cat.needs.energy + 20);
      resumeWalk(world, cat);
    } else world.coins += 3;
    fishing.supplies[key]--;
    emit(command.type === 'USE_CAN' ? 'can-used' : 'trash-recycled');
  } else if (command.type === 'INVITE_PEPPER') {
    if (world.cats.some((cat) => cat.definitionId === 'PEPPER'))
      throw new CommandError('ALREADY_INVITED');
    if (world.cats.length >= 16) throw new CommandError('CAT_LIMIT');
    const position = Array.from({ length: 100 }, (_, n) => ({
      x: n % 10,
      y: Math.floor(n / 10),
    })).find((p) => isWalkable(world, p));
    if (!position) throw new CommandError('INVALID_PLACEMENT');
    const cat = instantiatePepper(`cat-${world.nextId++}`, position);
    world.cats.push(cat);
    emit('companion-invited', cat.id);
  } else if (command.type === 'BUY_BAIT') {
    const price = BAITS[command.baitId].price;
    if (world.coins < price) throw new CommandError('INSUFFICIENT_COINS');
    if (fishing.baits[command.baitId] >= 999)
      throw new CommandError('BAIT_LIMIT');
    world.coins -= price;
    fishing.baits[command.baitId]++;
    emit('bait-bought', command.baitId);
  } else if (command.type === 'FISH_BEGIN') {
    if (fishing.active) throw new CommandError('ALREADY_FISHING');
    const cat = world.cats.find((cat) => cat.id === command.catId);
    if (!cat) throw new CommandError('CAT_NOT_FOUND');
    if (cat.rest) throw new CommandError('CAT_RESTING');
    if (
      !spotUnlocked(
        command.spotId,
        fishing.xp,
        Object.values(fishing.atlas).filter((entry) => entry.count > 0).length,
      )
    )
      throw new CommandError('SPOT_LOCKED');
    if (!atFishingShore(world, cat, command.spotId))
      throw new CommandError('TRAVEL_REQUIRED');
    if (cat.needs.energy < 8) throw new CommandError('LOW_STAMINA');
    if (fishing.inventory.length >= 30) throw new CommandError('BAG_FULL');
    if (command.baitId !== 'BREAD') {
      if (fishing.baits[command.baitId] === 0)
        throw new CommandError('NO_BAIT');
      fishing.baits[command.baitId]--;
    }
    cat.fishingSpotId = command.spotId;
    const serial = world.nextId++;
    fishing.active = initialAngling({
      catId: command.catId,
      catBreed: world.cats.find((cat) => cat.id === command.catId)!.breedId,
      baitId: command.baitId,
      direction: command.direction,
      aimDepth: command.aimDepth,
      spotId: command.spotId,
      id: `angling-${serial}`,
      seed: (world.seed ^ Math.imul(serial, 2246822519)) >>> 0,
      skillLevel: skillLevel(fishing.xp),
    });
    cat.needs.energy -= 8;
    emit('started', fishing.active.id);
  } else if (
    command.type === 'FISH_CAST' ||
    command.type === 'FISH_CONTROL' ||
    command.type === 'FISH_MOTION_CONTROL' ||
    command.type === 'FISH_CANCEL'
  ) {
    const run = fishing.active;
    if (!run || run.id !== command.runId)
      throw new CommandError('RUN_NOT_FOUND');
    if (command.type === 'FISH_CANCEL') {
      fishing.active = null;
      emit('cancelled', run.id);
      return events;
    }
    if (command.type === 'FISH_CAST') {
      if (run.phase !== 'charge') throw new CommandError('CAST_NOT_READY');
      fishing.active = castAngling(run, command.power);
      emit('waiting', run.id);
      return events;
    }
    if (command.type === 'FISH_MOTION_CONTROL' && run.phase !== 'hook')
      throw new CommandError('MOTION_NOT_READY');
    const next =
      command.type === 'FISH_MOTION_CONTROL'
        ? stepMotionAngling(run, command.x, command.y, command.ticks)
        : stepAngling(run, command.pressed, command.ticks);
    fishing.active = next;
    emit(next.phase === run.phase ? 'control' : next.phase, run.id);
    if (next.phase === 'caught' || next.phase === 'escaped') {
      const speciesId = next.speciesId;
      const trashAmount = failureTrash(
        next.seed,
        speciesId,
        next.phase === 'escaped',
      );
      fishing.supplies.trash += trashAmount;
      fishing.lastResult = {
        runId: next.id,
        catId: next.catId,
        spotId: next.spotId,
        minute: world.minute,
        caught: next.phase === 'caught',
        trashAmount,
        speciesId,
        catchKind: next.catchKind,
        lengthMm: next.lengthMm,
        lootAmount: next.lootAmount,
        weight: next.weight,
        reason: next.reason,
      };
      if (next.phase === 'caught' && next.catchKind !== 'fish') {
        if (next.catchKind === 'coins') {
          world.coins += next.lootAmount;
          fishing.supplies.coinBags++;
        } else fishing.supplies.cans++;
      } else if (next.phase === 'caught' && speciesId) {
        if (
          !canCatchFish(
            speciesId,
            world.cats.find((cat) => cat.id === next.catId)!.breedId,
          )
        )
          throw new CommandError('BREED_REQUIRED');
        fishing.inventory.push({
          id: `fish-${world.nextId++}`,
          speciesId,
          weight: next.weight,
          lengthMm: next.lengthMm,
        });
        const record = fishing.atlas[speciesId];
        record.count++;
        record.bestLengthMm = Math.max(record.bestLengthMm, next.lengthMm);
        record.bestWeight = Math.max(record.bestWeight, next.weight);
        fishing.xp = Math.min(
          1_000_000_000,
          fishing.xp + 10 + fishById(speciesId).stars * 5,
        );
        const cat = world.cats.find((cat) => cat.id === next.catId)!;
        cat.fishingMemory ??= {
          runId: next.id,
          speciesId,
          spotId: next.spotId,
          minute: world.minute,
        };
        cat.mood = Math.min(100, cat.mood + 3);
        rewardBond(cat, world.minute);
      }
      fishing.active = null;
    }
  } else if (command.type === 'SELL_FISH' || command.type === 'GIFT_FISH') {
    const index = fishing.inventory.findIndex(
      (fish) => fish.id === command.fishId,
    );
    if (index === -1) throw new CommandError('FISH_NOT_FOUND');
    const fish = fishing.inventory[index]!;
    if (command.type === 'SELL_FISH') {
      world.coins += fishById(fish.speciesId).price;
      emit('sold', fish.id);
    } else {
      const cat = world.cats.find((cat) => cat.id === command.catId);
      if (!cat) throw new CommandError('CAT_NOT_FOUND');
      const favorite = cat.favoriteFish.includes(fish.speciesId);
      cat.fishGift = {
        fishId: fish.id,
        speciesId: fish.speciesId,
        minute: world.minute,
        favorite,
      };
      cat.mood = Math.min(100, cat.mood + (favorite ? 8 : 3));
      cat.needs.hunger = Math.max(0, cat.needs.hunger - 10);
      rewardBond(cat, world.minute);
      emit(favorite ? 'favorite-gift' : 'gift', cat.id);
    }
    fishing.inventory.splice(index, 1);
  }
  return events;
}
