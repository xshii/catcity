import type { CatBreed } from '../breeds';
import {
  FISH,
  SPOT_IDS,
  SPOTS,
  STAR_ODDS,
  STAR_ODDS_BY_FISH_STARS,
  type FishId,
  type SpotId,
} from './catalog';
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
type Fish = (typeof FISH)[number];
/** A catch's length (mm) grows with its weight across the species' range, rounded down. */
export const catchLengthMm = (fish: Fish, weight: number) =>
  fish.minLengthMm +
  Math.floor(
    ((weight - fish.minWeight) * (fish.maxLengthMm - fish.minLengthMm)) /
      (fish.maxWeight - fish.minWeight),
  );
/** The odds (percent) of the species' bronze, silver and gold (R-54). */
export const starOdds = (id: FishId) =>
  STAR_ODDS[STAR_ODDS_BY_FISH_STARS[fishById(id).stars]];
/**
 * The record lengths of a species' bronze, silver and gold: every weight is as likely,
 * so each star starts where that share of the species' catches, the longest, begins.
 */
const STAR_LENGTHS = Object.fromEntries(
  FISH.map((fish) => {
    const lengths = Array.from(
      { length: fish.maxWeight - fish.minWeight + 1 },
      (_, index) => catchLengthMm(fish, fish.minWeight + index),
    );
    return [
      fish.id,
      starOdds(fish.id).map(
        (percent) =>
          lengths[
            lengths.length - Math.round((lengths.length * percent) / 100)
          ]!,
      ),
    ];
  }),
) as Record<FishId, number[]>;
/** Stars (0–3: bronze, silver, gold) a species' record length earns; derived, not saved. */
export const lengthStar = (id: FishId, bestLengthMm: number) =>
  STAR_LENGTHS[id].filter((length) => bestLengthMm >= length).length;
/** Unlocks derive from XP and atlas progress; no separate unlock flags are saved. */
export const spotOpen = (
  spot: SpotId,
  progress: { xp: number; atlas: Record<FishId, { count: number }> },
) => spotUnlocked(spot, progress.xp, discoveredSpecies(progress.atlas));

export function canCatchFish(id: FishId, breed: CatBreed): boolean {
  const required = fishById(id).requiredBreed;
  return required === null || required === breed;
}
