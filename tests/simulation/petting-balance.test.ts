import { expect, it } from 'vitest';
import { PETTING, PET_SPOTS } from '../../src/content/petting';
import { RandomService } from '../../src/core/random';
import {
  pettingOutcome,
  playPetting,
  purring,
  type PetStroke,
  type PetTastes,
} from '../../src/minigames/petting';

/**
 * Petting balance (spec 039): simulated players stroke for a whole round.
 * - careless: any spot, at an uneven two strokes a second, deaf to the purr and blind to
 *   the cat pulling away;
 * - attentive: knows the favourite spot and strokes it unhurriedly while it hears the
 *   purr, which it notices a little late.
 */
const ROUNDS = 400;
/** Average mood per round, in the bounds the design asks for: [player, min, max]. */
const TARGETS = [
  ['careless', 2, 3],
  ['attentive', 6, 8],
] as const;
/** Ticks an attentive player takes to notice the purr swell or fade. */
const NOTICE = 4;

const between = (rng: RandomService, low: number, high: number) =>
  low + rng.nextInt(high - low + 1);

const PLAYERS = {
  careless(rng: RandomService): PetStroke[] {
    const strokes: PetStroke[] = [];
    for (
      let tick = between(rng, 0, 10);
      tick < PETTING.roundTicks;
      tick += between(rng, 4, 16)
    )
      strokes.push({ tick, spot: PET_SPOTS[rng.nextInt(PET_SPOTS.length)]! });
    return strokes;
  },
  attentive(rng: RandomService, tastes: PetTastes): PetStroke[] {
    const strokes: PetStroke[] = [];
    for (
      let tick = between(rng, 0, 10);
      tick < PETTING.roundTicks;
      tick += between(rng, 10, 20)
    )
      if (tick >= NOTICE && purring(tick - NOTICE))
        strokes.push({ tick, spot: tastes.favourite });
    return strokes;
  },
};

function average(player: keyof typeof PLAYERS) {
  const rng = new RandomService(20260929);
  let mood = 0;
  let good = 0;
  for (let round = 0; round < ROUNDS; round++) {
    const favourite = PET_SPOTS[rng.nextInt(PET_SPOTS.length)]!;
    const others = PET_SPOTS.filter((spot) => spot !== favourite);
    const tastes = {
      favourite,
      disliked: others[rng.nextInt(others.length)]!,
    };
    const outcome = pettingOutcome(
      playPetting(tastes, PLAYERS[player](rng, tastes)),
    );
    mood += outcome.mood;
    good += outcome.good ? 1 : 0;
  }
  return { mood: mood / ROUNDS, good: good / ROUNDS };
}

it.each(TARGETS)(
  'a %s player averages %i to %i mood a round',
  (player, min, max) => {
    const { mood, good } = average(player);
    console.info(
      `petting balance: ${player} averages ${mood.toFixed(2)} mood, ${Math.round(good * 100)}% good rounds`,
    );
    expect(mood).toBeGreaterThanOrEqual(min);
    expect(mood).toBeLessThanOrEqual(max);
  },
);

it('knowing the cat is worth about twice as much as not', () => {
  expect(average('attentive').mood).toBeGreaterThan(
    average('careless').mood * 2,
  );
});
