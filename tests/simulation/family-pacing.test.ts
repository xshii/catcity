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
 * The spec's targets are NOT met, and no number of T-22 meets them; they wait for the
 * user's decision (see design 5.4 and the T-22 report), so they are not asserted here:
 * - First kitten 1.5–2.5 hours. It takes about 160 casts of fishing (both parents to
 *   信任, 150 bond points each, spec 038), so the time follows the rhythm: measured
 *   2026-09-30 with a ragdoll stray, 0.9 / 1.3 / 1.9–2.0 / 2.5–2.6 hours at 20 / 30 / 45 /
 *   60 seconds a cast for a player who only fishes, and 0.6 / 0.7–0.8 / 1.1 / 1.2–1.4
 *   hours for the caring player (petting, gifts and chats as well). The clock speed
 *   barely matters: the river and petting run at 1×.
 * - Fifth generation at least 5 hours. Measured 3.5 / 5.2 / 7.8 / 10.3 hours for the
 *   fishing novice and 2.6–3.3 / 3.0–4.4 / 4.0–6.4 / 4.9–8.3 hours for the caring players
 *   at the same rhythms; the caring skilled player at 20 seconds and 4× needs 2.6 hours.
 *   Every kitten of these plays is born of parents at 信任 and so without talents: the
 *   talents do not make the fastest line faster. Given full talents from birth (beyond
 *   any play) the caring lines took from 24% less to 22% more time, the fishing ones the
 *   same.
 * - Some lines cannot reach the fifth generation at all: a kitten's sex is the seed's,
 *   the city holds 10 companions, and cats never leave (R-13). Here 9 of the 32 plays
 *   ran out of room with a cat of the fourth generation and no partner for it.
 *
 * What is asserted: every play ends, with a fifth generation or out of room; no cat has
 * a talent above its generation less one ("五代封顶", R-35: a level a generation at most,
 * 4 only from the fifth); and the world each play leaves is a valid save (the helper
 * loads it).
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
  'a %s %s player casting every %i seconds, city clock %i×, raises a line to the fifth generation or runs out of room',
  (style, hands, castSeconds, speed) => {
    const pace: FamilyPace = playFamily({
      style,
      hands,
      castSeconds,
      speed,
      stray: 'RAGDOLL',
      generation: 5,
    });
    expect(pace.born[2]).toBeGreaterThan(0);
    if (pace.stuck) expect(pace.born[5]).toBeUndefined();
    else expect(pace.born[5]).toBeGreaterThan(pace.born[4]!);
    for (const cat of pace.world.cats)
      for (const name of TALENT_NAMES)
        expect(cat.talent[name]).toBeLessThanOrEqual(cat.generation - 1);
  },
);
