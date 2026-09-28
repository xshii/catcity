import { FISHING, fishById, type FishId } from '../../content/fishing';
import { RandomService, streamSeed } from '../random';

/** An independent seeded failure roll: no reward for cancel or successful catches. */
export function failureTrash(
  seed: number,
  speciesId: FishId | null,
  failed: boolean,
): number {
  if (!failed || !speciesId) return 0;
  const { maxStars, baseChancePercent, chancePerStarPercent } = FISHING.trash;
  const stars = fishById(speciesId).stars;
  if (stars > maxStars) return 0;
  const chance = baseChancePercent - stars * chancePerStarPercent;
  return new RandomService(streamSeed(seed, 'trash')).nextInt(100) < chance
    ? 1
    : 0;
}
