/** Fishing content entry: spec and motion (numbers), catalog (data), rules (derivations). */
export { FISHING } from './spec';
export {
  BAIT_IDS,
  BAITS,
  FISH,
  FISH_IDS,
  fishStars,
  LOOT,
  SPOT_IDS,
  SPOTS,
} from './catalog';
export type { BaitId, CatchKind, FishId, SpotId } from './catalog';
export {
  canCatchFish,
  catchLengthMm,
  catchXp,
  discoveredSpecies,
  fishById,
  fishHabitats,
  lengthStar,
  skillLevel,
  skillXp,
  spotOpen,
  spotUnlocked,
  starOdds,
} from './rules';
