import { expect, it } from 'vitest';
import type { CatBreed } from '../../src/content/breeds';
import {
  FISH,
  lengthStar,
  type BaitId,
  type FishId,
  type SpotId,
} from '../../src/content/fishing';
import { runSeed } from '../../src/core/random';
import { castAngling, initialAngling } from '../../src/minigames/angling';

/**
 * Where each species bites, by its clue; the cast lands on its shadow too, so a moon carp
 * is certain rather than the rules' 65 %. The size of a catch is drawn after the species.
 */
const WHERE: Record<
  FishId,
  { spotId: SpotId; baitId: BaitId; direction: number; catBreed: CatBreed }
> = {
  SILVER: {
    spotId: 'POND',
    baitId: 'BREAD',
    direction: -30,
    catBreed: 'RAGDOLL',
  },
  CRUCIAN: {
    spotId: 'POND',
    baitId: 'BREAD',
    direction: 0,
    catBreed: 'RAGDOLL',
  },
  PERCH: { spotId: 'REEDS', baitId: 'WORM', direction: 0, catBreed: 'RAGDOLL' },
  CATFISH: {
    spotId: 'REEDS',
    baitId: 'SHRIMP',
    direction: 30,
    catBreed: 'RAGDOLL',
  },
  KOI: { spotId: 'MOON', baitId: 'WORM', direction: -30, catBreed: 'RAGDOLL' },
  MOON_CARP: {
    spotId: 'MOON',
    baitId: 'SHRIMP',
    direction: 30,
    catBreed: 'BRITISH_SHORTHAIR',
  },
  MACKEREL: {
    spotId: 'COAST',
    baitId: 'WORM',
    direction: 0,
    catBreed: 'RAGDOLL',
  },
  SEA_BREAM: {
    spotId: 'COAST',
    baitId: 'SHRIMP',
    direction: 30,
    catBreed: 'RAGDOLL',
  },
};
const CASTS = 4000;

/**
 * The share of a species' catches whose length alone earns at least 1, 2 and 3 stars.
 * Runs are seeded as Core seeds them (world seed and run serial): raw consecutive seeds
 * would skew the first draw of the LCG, and with it the size.
 */
function starOdds(species: FishId) {
  const reached = [0, 0, 0];
  for (let serial = 1; serial <= CASTS; serial++) {
    const run = castAngling(
      initialAngling({
        ...WHERE[species],
        id: 'angling-1',
        catId: 'cat-1',
        seed: runSeed(42, serial),
        skillLevel: 1,
        aimDepth: 50,
        mode: 'buttons',
        happy: false,
      }),
      90,
      species,
    );
    expect(run.speciesId).toBe(species);
    const stars = lengthStar(species, run.lengthMm);
    for (let star = 0; star < stars; star++) reached[star]!++;
  }
  const [bronze, silver, gold] = reached.map((count) => count / CASTS);
  return { bronze: bronze!, silver: silver!, gold: gold! };
}

it('a catch earns gold more easily the fewer stars its species has; bronze is no given (R-54)', () => {
  const odds = new Map(FISH.map((fish) => [fish.id, starOdds(fish.id)]));
  for (const fish of FISH) {
    const { bronze, silver, gold } = odds.get(fish.id)!;
    // Each star is a real step; at least a third of catches earn no star at all.
    expect(gold).toBeGreaterThan(0);
    expect(silver).toBeGreaterThan(gold);
    expect(bronze).toBeGreaterThan(silver);
    expect(bronze).toBeLessThanOrEqual(2 / 3);
  }
  for (const easier of FISH)
    for (const harder of FISH)
      if (easier.stars < harder.stars)
        expect(
          odds.get(easier.id)!.gold,
          `${easier.id} gold vs ${harder.id}`,
        ).toBeGreaterThanOrEqual(odds.get(harder.id)!.gold);
});
