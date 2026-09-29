import {
  FISHING,
  fishById,
  SPOT_IDS,
  SPOTS,
  type FishId,
  type SpotId,
} from '../../content/fishing';
import { RandomService, runSeed, streamSeed } from '../random';
import type { WorldState } from '../schema';

const S = FISHING.shadows;
type ShadowSize = keyof typeof S.sizes;
export interface FishShadow {
  id: string;
  /** Cast coordinates: aim direction (degrees) and reach (mean of aimed depth and power). */
  direction: number;
  reach: number;
  size: ShadowSize;
  /** Hidden from the player, who only sees the size. */
  speciesId: FishId;
}

const sizeOf = (stars: number) =>
  (Object.keys(S.sizes) as ShadowSize[]).find(
    (size) => stars <= S.sizes[size][1],
  )!;

/**
 * The fish shadows at a spot this game hour (spec 033). Derived from the world seed, the
 * spot and the hour, so nothing is saved; the View draws them and a cast meets them.
 */
export function fishShadows(
  world: Pick<WorldState, 'seed' | 'minute'>,
  spotId: SpotId,
): FishShadow[] {
  const hour = Math.floor(world.minute / S.refreshMinutes);
  const rng = new RandomService(
    runSeed(
      streamSeed(world.seed, 'shadow'),
      hour * SPOT_IDS.length + SPOT_IDS.indexOf(spotId),
    ),
  );
  const pool = SPOTS[spotId].fish;
  const weight = (id: FishId) => S.starWeight[fishById(id).stars];
  const total = pool.reduce((sum, id) => sum + weight(id), 0);
  return Array.from({ length: S.count }, (_, index) => {
    let roll = rng.nextInt(total);
    const speciesId = pool.find((id) => (roll -= weight(id)) < 0)!;
    return {
      id: `shadow-${hour}-${index}`,
      direction: rng.nextInt(2 * S.maxDirection + 1) - S.maxDirection,
      reach: S.reach.min + rng.nextInt(S.reach.max - S.reach.min + 1),
      size: sizeOf(fishById(speciesId).stars),
      speciesId,
    };
  });
}

/** The shadow a cast lands on: the nearest within the radius, or null. */
export function shadowAt(
  shadows: readonly FishShadow[],
  cast: { direction: number; aimDepth: number; power: number },
): FishShadow | null {
  // Doubled units keep the half-unit landing reach in integers.
  const distance = (shadow: FishShadow) =>
    (2 * (cast.direction - shadow.direction)) ** 2 +
    (cast.aimDepth + cast.power - 2 * shadow.reach) ** 2;
  let nearest: FishShadow | null = null;
  for (const shadow of shadows)
    if (
      distance(shadow) <= (2 * S.radius) ** 2 &&
      (!nearest || distance(shadow) < distance(nearest))
    )
      nearest = shadow;
  return nearest;
}
