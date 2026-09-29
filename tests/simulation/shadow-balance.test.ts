import { expect, it } from 'vitest';
import type { CatBreed } from '../../src/content/breeds';
import { FISHING, fishById, type BaitId } from '../../src/content/fishing';
import { fishShadows, type FishShadow } from '../../src/core';
import { shadowAt } from '../../src/core/fishing/shadows';
import { RandomService, runSeed } from '../../src/core/random';
import { castAngling, initialAngling } from '../../src/minigames/angling';

/**
 * Fish shadow balance (spec 033) at the moon lake, the only water with large (4–5★)
 * shadows. Players see sizes, never species. Each sample is a world and a game hour.
 * The fight of a given fish is unchanged by shadows (tests/unit/fish-shadows.test.ts);
 * only which fish bites moves, so this measures the share of 4–5★ fish hooked.
 */
const SAMPLES = 2000;
/** Largest uplift in points the best shadow play may add to the old best play. */
const MAX_EXPERT_UPLIFT = 10;
type Cast = { direction: number; aimDepth: number; power: number };
type Aim = (shadows: FishShadow[], rng: RandomService) => Cast;
const SCENARIOS = [
  // A shorthair can land moon carp (shrimp, right, strong: 65%); a ragdoll koi (worm, left).
  { breed: 'BRITISH_SHORTHAIR', bait: 'SHRIMP', side: 1, power: 75 },
  { breed: 'RAGDOLL', bait: 'WORM', side: -1, power: 65 },
] as const;

/** Percent of casts hooking a 4–5★ fish; `blind` replays the rules before shadows. */
function highStars(
  breed: CatBreed,
  bait: BaitId,
  aim: Aim,
  blind = false,
): number {
  let high = 0;
  for (let sample = 1; sample <= SAMPLES; sample++) {
    const world = { seed: sample * 7919, minute: (sample % 48) * 60 };
    const shadows = fishShadows(world, 'MOON');
    const cast = aim(shadows, new RandomService(sample));
    const run = castAngling(
      initialAngling({
        happy: false,
        id: 'angling-1',
        catId: 'mochi',
        seed: runSeed(world.seed, sample),
        baitId: bait,
        direction: cast.direction,
        aimDepth: cast.aimDepth,
        skillLevel: 1,
        spotId: 'MOON',
        catBreed: breed,
        mode: 'motion',
      }),
      cast.power,
      blind ? null : (shadowAt(shadows, cast)?.speciesId ?? null),
    );
    if (run.speciesId && fishById(run.speciesId).stars >= 4) high++;
  }
  return Math.round((high / SAMPLES) * 100);
}

const { maxDirection, maxDepth } = FISHING.input;
const random: Aim = (_, rng) => ({
  direction: rng.nextInt(2 * maxDirection + 1) - maxDirection,
  aimDepth: rng.nextInt(maxDepth + 1),
  power: 55 + rng.nextInt(26),
});
/** Land on the shadow head-on, if the depth slider reaches it at this power. */
const onto = (shadow: FishShadow, power: number): Cast | null => {
  const aimDepth = 2 * shadow.reach - power;
  return aimDepth >= 0 && aimDepth <= maxDepth
    ? { direction: shadow.direction, aimDepth, power }
    : null;
};
/** A casual player: a large shadow if one shows, else anywhere. */
const hunter =
  (power: number): Aim =>
  (shadows, rng) =>
    shadows
      .filter((shadow) => shadow.size === 'large')
      .map((shadow) => onto(shadow, power))
      .find(Boolean) ?? random(shadows, rng);
/** Follows the atlas clue: the bait's side, a clean cast. */
const clue =
  (side: number, power: number): Aim =>
  () => ({ direction: 30 * side, aimDepth: 50, power });
/**
 * The best play on sizes alone: a large shadow on the clue's side, else a clue cast that
 * keeps clear of smaller shadows.
 */
const expert =
  (side: number, power: number): Aim =>
  (shadows) => {
    const large = shadows
      .filter(
        (shadow) =>
          shadow.size === 'large' &&
          shadow.direction * side > FISHING.encounter.sideDegrees,
      )
      .map((shadow) => onto(shadow, power))
      .find(Boolean);
    if (large) return large;
    for (let direction = 15; direction <= maxDirection; direction += 5)
      for (let aimDepth = 0; aimDepth <= maxDepth; aimDepth += 10) {
        const cast = { direction: direction * side, aimDepth, power };
        const met = shadowAt(shadows, cast);
        if (!met || met.size === 'large') return cast;
      }
    return { direction: 30 * side, aimDepth: 50, power };
  };

it.each(SCENARIOS)(
  'aiming at large shadows lifts 4–5★ bites for a casual $breed player, within the old best',
  ({ breed, bait, side, power }) => {
    const casual = highStars(breed, bait, random);
    const hunting = highStars(breed, bait, hunter(power));
    const oldBest = highStars(breed, bait, clue(side, power), true);
    const report = `${breed}: casual ${casual}%, hunting ${hunting}%, old best ${oldBest}%`;
    expect(hunting, report).toBeGreaterThan(casual);
    expect(hunting, report).toBeLessThanOrEqual(oldBest);
  },
);

it.each(SCENARIOS)(
  'shadows never cost the old best play for a $breed, even ignoring them',
  ({ breed, bait, side, power }) => {
    const oldBest = highStars(breed, bait, clue(side, power), true);
    const ignoring = highStars(breed, bait, clue(side, power));
    const report = `${breed}: old best ${oldBest}%, ignoring shadows ${ignoring}%`;
    expect(ignoring, report).toBeGreaterThanOrEqual(oldBest);
  },
);

it.each(SCENARIOS)(
  'the best shadow play adds little to the old best for a $breed',
  ({ breed, bait, side, power }) => {
    const oldBest = highStars(breed, bait, clue(side, power), true);
    const best = highStars(breed, bait, expert(side, power));
    const report = `${breed}: old best ${oldBest}%, with shadows ${best}%`;
    expect(best, report).toBeGreaterThanOrEqual(oldBest);
    expect(best - oldBest, report).toBeLessThanOrEqual(MAX_EXPERT_UPLIFT);
  },
);
