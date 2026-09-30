import { atFishingShore, resumeWalk } from '../city/walking';
import {
  BAITS,
  catchXp,
  FISHING,
  fishById,
  skillLevel,
  spotOpen,
  type BaitId,
  type FishId,
} from '../../content/fishing';
import { BOND } from '../../content/care';
import { MOOD } from '../../content/mood';
import { requireCat } from '../cats';
import {
  castAngling,
  initialAngling,
  stepAngling,
  type AnglingRun,
} from '../../minigames/angling';
import { stepMotionRun, strikeMotionRun } from '../../minigames/angling-motion';
import { rewardBond, spendDaily } from '../bond';
import { liftCalmMood, liftMood } from '../mood';
import { CommandError, type GameCommand, type GameEvent } from '../commands';
import type { WorldState } from '../schema';
import { failureTrash } from './rewards';
import { shadowUnderCast } from './shadows';
import { runSeed } from '../random';
import { MAX_STAT, WORLD_LIMIT } from '../limits';
import { grantWish } from '../wishes';

const { cast: CAST, supplies: SUPPLIES } = FISHING;

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
  /** The fish of the shadow this hour that a cast at `power` lands on (spec 033). */
  const shadowUnder = (run: AnglingRun, power: number) =>
    shadowUnderCast(world, run.spotId, { ...run, power })?.speciesId ?? null;
  /** The cast itself costs stamina and one bait (bread is free); preparing is free. */
  const payForCast = (catId: string, baitId: BaitId) => {
    const cat = world.cats.find((cat) => cat.id === catId)!;
    if (cat.needs.energy < CAST.staminaCost)
      throw new CommandError('LOW_STAMINA');
    if (baitId !== 'BREAD' && fishing.baits[baitId] === 0)
      throw new CommandError('NO_BAIT');
    cat.needs.energy -= CAST.staminaCost;
    if (baitId !== 'BREAD') fishing.baits[baitId]--;
  };
  if (command.type === 'USE_CAN' || command.type === 'RECYCLE_TRASH') {
    const key = command.type === 'USE_CAN' ? 'cans' : 'trash';
    if (!fishing.supplies[key]) throw new CommandError('NO_SUPPLIES');
    if (command.type === 'USE_CAN') {
      const cat = requireCat(world, command.catId);
      if (cat.needs.energy === MAX_STAT) throw new CommandError('STAMINA_FULL');
      cat.needs.energy = Math.min(
        MAX_STAT,
        cat.needs.energy + SUPPLIES.canEnergy,
      );
      resumeWalk(world, cat);
    } else world.coins += SUPPLIES.trashCoins;
    fishing.supplies[key]--;
    emit(command.type === 'USE_CAN' ? 'can-used' : 'trash-recycled');
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
    const cat = requireCat(world, command.catId);
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
      happy: cat.mood >= MOOD.happy,
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
      // Every cast pays, whether swung (motion) or given an explicit power.
      payForCast(run.catId, run.baitId);
      fishing.active = castAngling(
        run,
        command.power,
        shadowUnder(run, command.power),
      );
      emit('waiting', run.id);
      return events;
    }
    // A button release casts at the charged power.
    const next = advanceRun(
      run,
      command,
      run.phase === 'charge' ? shadowUnder(run, run.power) : null,
    );
    // Releasing a button charge is the cast: it pays now.
    if (run.phase === 'charge' && next.phase !== 'charge')
      payForCast(run.catId, run.baitId);
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
          fishing.xp + catchXp(fishById(speciesId).stars, next.happy),
        );
        const cat = world.cats.find((cat) => cat.id === next.catId)!;
        cat.fishingMemory ??= {
          runId: next.id,
          speciesId,
          spotId: next.spotId,
          minute: world.minute,
        };
        // One meaning of happy for the whole catch: the run's, as for its XP.
        rewardBond(cat, BOND.catch, next.happy);
        liftCalmMood(cat, MOOD.catch);
        grantWish(world, cat, 'OUTING', next.spotId, events);
      } else if (next.phase === 'escaped') {
        const cat = world.cats.find((cat) => cat.id === next.catId)!;
        cat.mood = Math.max(0, cat.mood - MOOD.escape);
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
      const cat = requireCat(world, command.catId);
      const favorite = cat.favoriteFish.includes(fish.speciesId);
      cat.fishGift = {
        fishId: fish.id,
        speciesId: fish.speciesId,
        minute: world.minute,
        favorite,
      };
      // Past the day's allowance the fish is still taken and remembered, nothing more.
      const counted = spendDaily(cat.giftBond, world.minute, BOND.giftsPerDay);
      if (counted) {
        cat.giftBond = counted;
        rewardBond(cat, favorite ? BOND.favoriteGift : BOND.gift);
        liftMood(cat, favorite ? MOOD.favoriteGift : MOOD.gift);
      }
      emit(
        counted ? (favorite ? 'favorite-gift' : 'gift') : 'gift-kept',
        cat.id,
      );
      // A wished-for fish is granted even past the day's allowance of gifts.
      grantWish(world, cat, 'FISH', fish.speciesId, events);
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
  shadow: FishId | null,
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
  return stepAngling(run, command.pressed, command.ticks, shadow);
}
