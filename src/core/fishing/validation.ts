import {
  canCatchFish,
  fishById,
  skillLevel,
  spotUnlocked,
  SPOTS,
} from '../../content/fish';
import type { WorldState } from '../schema';
import { failureTrash } from './rewards';
import { motionTarget } from '../../minigames/angling';

export function assertFishing(
  world: WorldState,
  uniqueId: (id: string) => void,
): void {
  const f = world.fishing;
  const validId = (id: string, prefix: string) =>
    new RegExp(`^${prefix}-[1-9]\\d*$`).test(id) &&
    Number(id.slice(prefix.length + 1)) < world.nextId;
  const discovered = Object.values(f.atlas).filter(
    (entry) => entry.count > 0,
  ).length;
  for (const [key, entry] of Object.entries(f.atlas)) {
    const species = fishById(key as keyof typeof f.atlas);
    if (
      (entry.count === 0) !== (entry.bestWeight === 0) ||
      (entry.count === 0) !== (entry.bestLengthMm === 0) ||
      (entry.count > 0 &&
        (entry.bestLengthMm < species.minLengthMm ||
          entry.bestLengthMm > species.maxLengthMm)) ||
      (entry.count > 0 &&
        (entry.bestWeight < species.minWeight ||
          entry.bestWeight > species.maxWeight))
    )
      throw new Error('Invalid atlas');
  }
  for (const fish of f.inventory) {
    uniqueId(fish.id);
    const species = fishById(fish.speciesId);
    if (
      !validId(fish.id, 'fish') ||
      fish.weight < species.minWeight ||
      fish.weight > species.maxWeight ||
      f.atlas[fish.speciesId].count <
        f.inventory.filter((item) => item.speciesId === fish.speciesId)
          .length ||
      f.atlas[fish.speciesId].bestWeight < fish.weight ||
      fish.lengthMm < species.minLengthMm ||
      fish.lengthMm > species.maxLengthMm ||
      f.atlas[fish.speciesId].bestLengthMm < fish.lengthMm
    )
      throw new Error('Invalid fish inventory');
  }
  const run = f.active;
  if (run) {
    uniqueId(run.id);
    if (
      !validId(run.id, 'angling') ||
      !world.cats.some(
        (cat) =>
          cat.id === run.catId &&
          cat.breedId === run.catBreed &&
          cat.fishingSpotId === run.spotId,
      ) ||
      run.seed !==
        (world.seed ^ Math.imul(Number(run.id.slice(8)), 2246822519)) >>> 0 ||
      run.skillLevel !== skillLevel(f.xp) ||
      !spotUnlocked(run.spotId, f.xp, discovered) ||
      ['caught', 'escaped'].includes(run.phase) ||
      run.reason !== 'none' ||
      run.phaseTick > run.tick
    )
      throw new Error('Invalid active fishing');
    if (run.phase === 'charge') {
      if (
        run.speciesId !== null ||
        run.weight !== 0 ||
        run.lengthMm !== 0 ||
        run.lootAmount !== 0 ||
        run.catchKind !== 'fish'
      )
        throw new Error('Invalid fishing phase');
    } else {
      if (!run.hasHeld || (run.phase === 'fight' && run.catchKind !== 'fish'))
        throw new Error('Invalid fishing phase');
      assertCatch(run);
      if (run.speciesId && !canCatchFish(run.speciesId, run.catBreed))
        throw new Error('Invalid breed encounter');
    }
    if (
      run.phase === 'hook'
        ? run.phaseTick >= 128 ||
          run.motionStableTicks >= motionTarget(run).holdTicks ||
          run.motionStableTicks > run.phaseTick ||
          (run.motionStableTicks > 0 && run.pressed)
        : run.motionStableTicks !== 0
    )
      throw new Error('Invalid motion hook state');
  }

  const result = f.lastResult;
  if (result) {
    if (
      !validId(result.runId, 'angling') ||
      result.runId === run?.id ||
      result.minute > world.minute ||
      !world.cats.some((cat) => cat.id === result.catId) ||
      result.caught !== (result.reason === 'none')
    )
      throw new Error('Invalid fishing result');
    const resultSeed =
      (world.seed ^ Math.imul(Number(result.runId.slice(8)), 2246822519)) >>> 0;
    if (
      result.trashAmount !==
      failureTrash(resultSeed, result.speciesId, !result.caught)
    )
      throw new Error('Invalid failure reward');
    assertCatch(result);
    if (
      result.speciesId &&
      (!canCatchFish(
        result.speciesId,
        world.cats.find((cat) => cat.id === result.catId)!.breedId,
      ) ||
        (result.caught && f.atlas[result.speciesId].count === 0))
    )
      throw new Error('Invalid fishing result');
  }
  for (const cat of world.cats) {
    if (cat.fishingSpotId && !spotUnlocked(cat.fishingSpotId, f.xp, discovered))
      throw new Error('Invalid cat fishing location');
    const memory = cat.fishingMemory;
    if (
      memory &&
      (!validId(memory.runId, 'angling') ||
        memory.runId === run?.id ||
        memory.minute > world.minute ||
        f.atlas[memory.speciesId].count === 0 ||
        !SPOTS[memory.spotId].fish.includes(memory.speciesId))
    )
      throw new Error('Invalid fishing memory');
    const gift = cat.fishGift;
    if (
      gift &&
      (!validId(gift.fishId, 'fish') ||
        gift.minute > world.minute ||
        f.inventory.some((fish) => fish.id === gift.fishId) ||
        f.atlas[gift.speciesId].count === 0 ||
        gift.favorite !== cat.favoriteFish.includes(gift.speciesId))
    )
      throw new Error('Invalid fish gift');
  }
}

function assertCatch(catchState: {
  catchKind: string;
  speciesId: Parameters<typeof fishById>[0] | null;
  spotId: keyof typeof SPOTS;
  weight: number;
  lengthMm: number;
  lootAmount: number;
}): void {
  if (catchState.catchKind === 'fish') {
    if (
      !catchState.speciesId ||
      !SPOTS[catchState.spotId].fish.includes(catchState.speciesId) ||
      catchState.lootAmount !== 0
    )
      throw new Error('Invalid fish encounter');
    const fish = fishById(catchState.speciesId);
    if (
      catchState.weight < fish.minWeight ||
      catchState.weight > fish.maxWeight ||
      catchState.lengthMm < fish.minLengthMm ||
      catchState.lengthMm > fish.maxLengthMm
    )
      throw new Error('Invalid fish size');
  } else if (
    catchState.speciesId !== null ||
    catchState.weight !== 0 ||
    catchState.lengthMm !== 0 ||
    (catchState.catchKind === 'coins'
      ? catchState.lootAmount < 25 || catchState.lootAmount > 50
      : catchState.lootAmount !== 1)
  )
    throw new Error('Invalid found item');
}
