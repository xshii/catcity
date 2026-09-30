import { expect, it } from 'vitest';
import { TALENT_NAMES } from '../../src/content/family';
import {
  playFamily,
  type FamilyPace,
  type Hands,
  type Style,
} from '../helpers/family-player';

/**
 * Family pacing (spec 041 T-22, design 5.4): real time from a new game to the first
 * kitten and to a cat of the fifth generation, by the players of
 * tests/helpers/family-player.ts, at four rhythms and two city clock speeds.
 *
 * The spec's targets (first kitten 1.5–2.5 hours, fifth generation at least 5 hours) are
 * not met, and no number of T-22 meets them: the fastest lines breed parents at 信任,
 * whose kittens have no talents. The user decided (2026-09-30) to merge T-22 without
 * asserting them and to set both with the coming bond retune: one reference rhythm, with
 * the exploit player and 4× in the simulation. Measured 2026-09-30, hours at 1× / 4×,
 * casting every 20 / 30 / 45 / 60 seconds (the table is in design 5.4):
 * - first kitten: fishing only 0.9 / 1.3 / 1.9–2.0 / 2.5; every shortcut 0.6 / 0.7–0.8 /
 *   1.1 / 1.2–1.3;
 * - fifth generation: fishing only 3.5–3.6 / 5.1–5.3 / 7.6–7.7 / 10.0–10.2; every shortcut
 *   2.5–3.4 / 2.8–4.2 / 4.0–6.2 / 5.3–7.8.
 *
 * What is asserted: with the sex chosen at naming (user 2026-09-30) every play reaches
 * the fifth generation with at most nine cats; with the sex left to the seed, 9 of these
 * 32 plays ran out of room with a fourth-generation cat and no partner for it (14817c5).
 * No cat has a talent above its generation less one ("五代封顶", R-35: a level a
 * generation at most, 4 only from the fifth), and the world each play leaves is a valid
 * save (the helper loads it).
 */
const RHYTHMS = [20, 30, 45, 60] as const;
const SPEEDS = [1, 4] as const;
const CASES = (['fishing', 'caring'] as const).flatMap((style: Style) =>
  (['novice', 'skilled'] as const).flatMap((hands: Hands) =>
    RHYTHMS.flatMap((castSeconds) =>
      SPEEDS.map((speed) => [style, hands, castSeconds, speed] as const),
    ),
  ),
);

it.each(CASES)(
  'a %s %s player casting every %i seconds, city clock %i×, raises a line to the fifth generation with 9 cats',
  (style, hands, castSeconds, speed) => {
    const pace: FamilyPace = playFamily({
      style,
      hands,
      castSeconds,
      speed,
      stray: 'RAGDOLL',
      generation: 5,
    });
    // With the sex chosen at naming (user 2026-09-30), no line runs out of room.
    expect(pace.stuck).toBe(false);
    expect(pace.born[5]).toBeGreaterThan(pace.born[4]!);
    expect(pace.born[4]).toBeGreaterThan(pace.born[3]!);
    expect(pace.born[3]).toBeGreaterThan(pace.born[2]!);
    expect(pace.world.cats.length).toBeLessThanOrEqual(9);
    for (const cat of pace.world.cats)
      for (const name of TALENT_NAMES)
        expect(cat.talent[name]).toBeLessThanOrEqual(cat.generation - 1);
  },
);
