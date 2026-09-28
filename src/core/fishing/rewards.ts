import { fishById, type FishId } from '../../content/fish';
import { RandomService } from '../random';

/** An independent seeded failure roll: no reward for cancel or successful catches. */
export function failureTrash(
  seed: number,
  speciesId: FishId | null,
  failed: boolean,
): number {
  if (!failed || !speciesId) return 0;
  const stars = fishById(speciesId).stars;
  if (stars > 2) return 0;
  return new RandomService((seed ^ 0x85ebca6b) >>> 0).nextInt(100) <
    60 - stars * 15
    ? 1
    : 0;
}
