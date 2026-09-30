import { expect, it } from 'vitest';
import {
  catchLengthMm,
  FISH,
  fishById,
  lengthStar,
  SPOT_IDS,
  starOdds,
} from '../../src/content/fishing';
import { runSeed } from '../../src/core/random';
import { castAngling, initialAngling } from '../../src/minigames/angling';

/** Percent of a species' catches whose length reaches 1, 2 and 3 stars: every weight once. */
function measuredOdds(fish: (typeof FISH)[number]) {
  const reached = [0, 0, 0];
  const weights = fish.maxWeight - fish.minWeight + 1;
  for (let weight = fish.minWeight; weight <= fish.maxWeight; weight++) {
    const stars = lengthStar(fish.id, catchLengthMm(fish, weight));
    for (let star = 0; star < stars; star++) reached[star]!++;
  }
  return reached.map((count) => (count * 100) / weights);
}

it('a cast sizes its catch by the same length formula the stars are measured with', () => {
  let casts = 0;
  for (let serial = 1; serial <= 40; serial++)
    for (const spotId of SPOT_IDS) {
      const run = castAngling(
        initialAngling({
          id: 'angling-1',
          catId: 'cat-1',
          seed: runSeed(42, serial),
          spotId,
          baitId: 'SHRIMP',
          direction: 30,
          catBreed: 'BRITISH_SHORTHAIR',
          skillLevel: 1,
          aimDepth: 50,
          mode: 'buttons',
          happy: false,
        }),
        90,
      );
      if (!run.speciesId) continue;
      casts++;
      expect(run.lengthMm).toBe(
        catchLengthMm(fishById(run.speciesId), run.weight),
      );
    }
  expect(casts).toBeGreaterThan(100);
});

it('each species reaches bronze, silver and gold as often as its typical odds, within a point (R-54)', () => {
  for (const fish of FISH) {
    const measured = measuredOdds(fish);
    starOdds(fish.id).forEach((percent, star) =>
      expect(
        Math.abs(measured[star]! - percent),
        `${fish.id} star ${star + 1}: ${measured[star]}%`,
      ).toBeLessThanOrEqual(1),
    );
  }
});

it('a few typical odds: gold rarer the more stars a species has, each star a step, bronze no given', () => {
  expect(
    new Set(FISH.map((fish) => starOdds(fish.id))).size,
  ).toBeGreaterThanOrEqual(3);
  for (const fish of FISH) {
    const [bronze, silver, gold] = starOdds(fish.id);
    expect(gold).toBeGreaterThan(0);
    expect(silver).toBeGreaterThan(gold);
    expect(bronze).toBeGreaterThan(silver);
    // At least a third of catches earn no star at all.
    expect(bronze).toBeLessThanOrEqual(66);
  }
  for (const easier of FISH)
    for (const harder of FISH)
      if (easier.stars < harder.stars)
        expect(
          starOdds(easier.id)[2],
          `${easier.id} gold vs ${harder.id}`,
        ).toBeGreaterThanOrEqual(starOdds(harder.id)[2]);
  const byStars = (stars: number) =>
    FISH.find((fish) => fish.stars === stars)!.id;
  expect(starOdds(byStars(0))[2]).toBeGreaterThan(starOdds(byStars(5))[2]);
});
