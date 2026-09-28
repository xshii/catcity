import { CITY_START } from '../../content/city';
import { atFishingShore, resumeWalk } from '../city/walking';
import {
  BAITS,
  catchXp,
  FISHING,
  fishById,
  skillLevel,
  spotOpen,
  type BaitId,
} from '../../content/fishing';
import { instantiateCat } from '../cats';
import {
  castAngling,
  initialAngling,
  stepAngling,
  type AnglingRun,
} from '../../minigames/angling';
import { stepMotionRun, strikeMotionRun } from '../../minigames/angling-motion';
import { rewardBond } from '../bond';
import { CommandError, type GameCommand, type GameEvent } from '../commands';
import type { CatEntity, Position, WorldState } from '../schema';
import { isWalkable } from '../city/path';
import { failureTrash } from './rewards';
import { runSeed } from '../random';
import { MAX_CATS, MAX_STAT, WORLD_LIMIT } from '../limits';

const { cast: CAST, supplies: SUPPLIES, companion: COMPANION } = FISHING;

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
  // Checked by the caller first; spends stamina and one bait (bread is free).
  const payForCast = (cat: CatEntity, baitId: BaitId) => {
    cat.needs.energy -= CAST.staminaCost;
    if (baitId !== 'BREAD') fishing.baits[baitId]--;
  };
  if (command.type === 'USE_CAN' || command.type === 'RECYCLE_TRASH') {
    const key = command.type === 'USE_CAN' ? 'cans' : 'trash';
    if (!fishing.supplies[key]) throw new CommandError('NO_SUPPLIES');
    if (command.type === 'USE_CAN') {
      const cat = world.cats.find((cat) => cat.id === command.catId);
      if (!cat) throw new CommandError('CAT_NOT_FOUND');
      if (cat.needs.energy === MAX_STAT) throw new CommandError('STAMINA_FULL');
      cat.needs.energy = Math.min(
        MAX_STAT,
        cat.needs.energy + SUPPLIES.canEnergy,
      );
      resumeWalk(world, cat);
    } else world.coins += SUPPLIES.trashCoins;
    fishing.supplies[key]--;
    emit(command.type === 'USE_CAN' ? 'can-used' : 'trash-recycled');
  } else if (command.type === 'INVITE_PEPPER') {
    if (world.cats.some((cat) => cat.definitionId === 'PEPPER'))
      throw new CommandError('ALREADY_INVITED');
    if (world.cats.length >= MAX_CATS) throw new CommandError('CAT_LIMIT');
    // Newcomers arrive at the free tile nearest the starter crossroads.
    const { crossroads } = CITY_START;
    const distance = (p: Position) =>
      Math.abs(p.x - crossroads.x) + Math.abs(p.y - crossroads.y);
    const position = world.map.tiles
      .map((tile) => tile.position)
      .filter((p) => isWalkable(world, p))
      .sort((a, b) => distance(a) - distance(b) || a.y - b.y || a.x - b.x)[0];
    if (!position) throw new CommandError('INVALID_PLACEMENT');
    const cat = instantiateCat('PEPPER', `cat-${world.nextId++}`, position);
    world.cats.push(cat);
    emit('companion-invited', cat.id);
  } else if (command.type === 'BUY_BAIT') {
    const price = BAITS[command.baitId].price;
    if (world.coins < price) throw new CommandError('INSUFFICIENT_COINS');
    if (fishing.baits[command.baitId] >= FISHING.bait.max)
      throw new CommandError('BAIT_LIMIT');
    world.coins -= price;
    fishing.baits[command.baitId]++;
    emit('bait-bought', command.baitId);
  } else if (command.type === 'FISH_BEGIN') {
    if (fishing.active) throw new CommandError('ALREADY_FISHING');
    const cat = world.cats.find((cat) => cat.id === command.catId);
    if (!cat) throw new CommandError('CAT_NOT_FOUND');
    if (cat.rest) throw new CommandError('CAT_RESTING');
    if (!spotOpen(command.spotId, fishing))
      throw new CommandError('SPOT_LOCKED');
    if (!atFishingShore(world, cat, command.spotId))
      throw new CommandError('TRAVEL_REQUIRED');
    if (cat.needs.energy < CAST.staminaCost)
      throw new CommandError('LOW_STAMINA');
    if (fishing.inventory.length >= FISHING.bag.capacity)
      throw new CommandError('BAG_FULL');
    if (command.baitId !== 'BREAD' && fishing.baits[command.baitId] === 0)
      throw new CommandError('NO_BAIT');
    const mode = command.mode ?? 'buttons';
    // Buttons pay when preparing; motion pays at the swing (FISH_CAST).
    if (mode === 'buttons') payForCast(cat, command.baitId);
    cat.fishingSpotId = command.spotId;
    const serial = world.nextId++;
    fishing.active = initialAngling({
      catId: command.catId,
      catBreed: cat.breedId,
      baitId: command.baitId,
      direction: command.direction,
      aimDepth: command.aimDepth,
      spotId: command.spotId,
      id: `angling-${serial}`,
      seed: runSeed(world.seed, serial),
      skillLevel: skillLevel(fishing.xp),
      mode,
    });
    emit('started', fishing.active.id);
  } else if (
    command.type === 'FISH_CAST' ||
    command.type === 'FISH_CONTROL' ||
    command.type === 'FISH_MOTION_CONTROL' ||
    command.type === 'FISH_STRIKE' ||
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
      if (run.mode === 'motion') {
        const cat = world.cats.find((cat) => cat.id === run.catId)!;
        if (cat.needs.energy < CAST.staminaCost)
          throw new CommandError('LOW_STAMINA');
        if (run.baitId !== 'BREAD' && fishing.baits[run.baitId] === 0)
          throw new CommandError('NO_BAIT');
        payForCast(cat, run.baitId);
      }
      fishing.active = castAngling(run, command.power);
      emit('waiting', run.id);
      return events;
    }
    const next = advanceRun(run, command);
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
        // Breed eligibility was enforced when the fish was chosen and on load.
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
          WORLD_LIMIT,
          fishing.xp + catchXp(fishById(speciesId).stars),
        );
        const cat = world.cats.find((cat) => cat.id === next.catId)!;
        cat.fishingMemory ??= {
          runId: next.id,
          speciesId,
          spotId: next.spotId,
          minute: world.minute,
        };
        cat.mood = Math.min(MAX_STAT, cat.mood + COMPANION.catchMood);
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
      cat.mood = Math.min(
        MAX_STAT,
        cat.mood + (favorite ? COMPANION.favoriteGiftMood : COMPANION.giftMood),
      );
      cat.needs.hunger = Math.max(0, cat.needs.hunger - COMPANION.giftHunger);
      rewardBond(cat, world.minute);
      emit(favorite ? 'favorite-gift' : 'gift', cat.id);
    }
    fishing.inventory.splice(index, 1);
  }
  return events;
}

/** Routes rod input to the frozen button model or the motion model of spec 030. */
function advanceRun(
  run: AnglingRun,
  command: Extract<
    GameCommand,
    { type: 'FISH_CONTROL' | 'FISH_MOTION_CONTROL' | 'FISH_STRIKE' }
  >,
): AnglingRun {
  if (run.mode === 'motion') {
    if (command.type === 'FISH_STRIKE') {
      if (run.phase !== 'waiting' && run.phase !== 'hook')
        throw new CommandError('STRIKE_NOT_READY');
      return strikeMotionRun(run);
    }
    if (command.type !== 'FISH_MOTION_CONTROL')
      throw new CommandError('WRONG_INPUT_MODE');
    if (run.phase === 'charge') throw new CommandError('CAST_NOT_READY');
    return stepMotionRun(run, { x: command.x, y: command.y }, command.ticks);
  }
  if (command.type !== 'FISH_CONTROL')
    throw new CommandError('WRONG_INPUT_MODE');
  return stepAngling(run, command.pressed, command.ticks);
}
