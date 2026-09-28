import type { CatBreed } from '../breeds';
import { FISH, SPOT_IDS, SPOTS, type FishId, type SpotId } from './catalog';
import { FISHING } from './spec';

export const fishById = (id: FishId) => FISH.find((fish) => fish.id === id)!;
/** Derive the atlas habitat range from the same pools used to validate catches. */
export function fishHabitats(id: FishId): SpotId[] {
  return SPOT_IDS.filter((spotId) => SPOTS[spotId].fish.includes(id));
}

export const skillLevel = (xp: number) =>
  Math.min(
    FISHING.skill.maxLevel,
    1 + Math.floor(xp / FISHING.skill.xpPerLevel),
  );
export const catchXp = (stars: number) =>
  FISHING.skill.baseXp + stars * FISHING.skill.xpPerStar;
export function spotUnlocked(
  spot: SpotId,
  xp: number,
  discovered: number,
): boolean {
  return (
    skillLevel(xp) >= SPOTS[spot].level && discovered >= SPOTS[spot].species
  );
}

export const discoveredSpecies = (atlas: Record<FishId, { count: number }>) =>
  Object.values(atlas).filter((entry) => entry.count > 0).length;
/** Unlocks derive from XP and atlas progress; no separate unlock flags are saved. */
export const spotOpen = (
  spot: SpotId,
  progress: { xp: number; atlas: Record<FishId, { count: number }> },
) => spotUnlocked(spot, progress.xp, discoveredSpecies(progress.atlas));

export function canCatchFish(id: FishId, breed: CatBreed): boolean {
  const required = fishById(id).requiredBreed;
  return required === null || required === breed;
}
