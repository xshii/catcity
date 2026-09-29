import type { CatBreed } from '../breeds';
import { FISH, SPOT_IDS, SPOTS, type FishId, type SpotId } from './catalog';
import { FISHING } from './spec';

export const fishById = (id: FishId) => FISH.find((fish) => fish.id === id)!;
/** Derive the atlas habitat range from the same pools used to validate catches. */
export function fishHabitats(id: FishId): SpotId[] {
  return SPOT_IDS.filter((spotId) => SPOTS[spotId].fish.includes(id));
}

const SKILL = FISHING.skill;
/** The XP in all that reaches a level; a product of three neighbours divides by 3. */
export const skillXp = (level: number) =>
  (SKILL.curve * (level - 1) * level * (level + 1)) / 3;
export function skillLevel(xp: number): number {
  let level = 1;
  while (level < SKILL.maxLevel && xp >= skillXp(level + 1)) level++;
  return level;
}
/** A happy cat's catch (the run's `happy`) earns more, rounded down. */
export const catchXp = (stars: number, happy: boolean) =>
  Math.floor(
    ((SKILL.baseXp + stars * SKILL.xpPerStar) *
      (happy ? SKILL.happyXpPercent : 100)) /
      100,
  );
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
