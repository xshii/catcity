import { describe, expect, it } from 'vitest';
import { PETTING, PET_SPOTS, type PetSpot } from '../../src/content/petting';
import {
  pettingAway,
  pettingDone,
  pettingOutcome,
  playPetting,
  purring,
  startPetting,
  stepPetting,
  strokePetting,
  tasteOf,
  type PettingRound,
} from '../../src/minigames/petting';

const TASTES = { favourite: 'CHIN', disliked: 'BELLY' } as const;
const { purr: PURR, pace: PACE, meter: METER, mood: MOOD } = PETTING;
/** A tick inside the purr and one outside it. */
const IN = 0;
const OUT = PURR.windowTicks;

const at = (tick: number, round = startPetting(TASTES)) =>
  stepPetting(round, tick - round.tick);
/** One stroke per purr on `spot`, from the first purr on. */
const onePerPurr = (spot: PetSpot, strokes: number) =>
  Array.from({ length: strokes }, (_, index) => ({
    tick: index * PURR.periodTicks,
    spot,
  }));

describe('a cat’s tastes', () => {
  it('name one favourite, one disliked and two neutral spots', () => {
    expect(PET_SPOTS.map((spot) => tasteOf(TASTES, spot))).toEqual([
      'neutral',
      'favourite',
      'neutral',
      'disliked',
    ]);
  });
});

describe('the purr', () => {
  it('swells at the start of every period, for a generous window', () => {
    expect(purring(0)).toBe(true);
    expect(purring(PURR.windowTicks - 1)).toBe(true);
    expect(purring(PURR.windowTicks)).toBe(false);
    expect(purring(PURR.periodTicks - 1)).toBe(false);
    expect(purring(PURR.periodTicks)).toBe(true);
    // Calming, not a test of skill: the window is more than half of the period.
    expect(PURR.windowTicks * 2).toBeGreaterThan(PURR.periodTicks);
  });
});

describe('a stroke', () => {
  it.each([
    ['favourite', 'CHIN', IN, METER.favourite.purring, 'purr'],
    ['favourite', 'CHIN', OUT, METER.favourite.other, 'like'],
    ['neutral', 'HEAD', IN, METER.neutral.purring, 'fine'],
    ['neutral', 'BACK', OUT, METER.neutral.other, 'fine'],
  ] as const)(
    'on a %s spot (%s) at tick %i adds %i',
    (_, spot, tick, gain, reaction) => {
      const round = strokePetting(at(tick), spot);
      expect(round.meter).toBe(gain);
      expect(round.last).toEqual({ tick, spot, reaction });
      expect(round.counts[spot]).toBe(1);
      expect(pettingAway(round)).toBe(false);
    },
  );

  it('on the disliked spot costs contentment and the cat pulls away for a second', () => {
    const content = strokePetting(strokePetting(at(IN), 'CHIN'), 'CHIN');
    const round = strokePetting(content, 'BELLY');
    expect(round.meter).toBe(METER.favourite.purring * 2 - METER.disliked);
    expect(round.last?.reaction).toBe('dislike');
    expect(round.counts.BELLY).toBe(1);
    expect(pettingAway(round)).toBe(true);
    const almostBack = stepPetting(round, PETTING.awayTicks - 1);
    expect(pettingAway(almostBack)).toBe(true);
    expect(pettingAway(stepPetting(almostBack, 1))).toBe(false);
  });

  it('is ignored while the cat has pulled away', () => {
    const away = strokePetting(at(IN), 'BELLY');
    const later = stepPetting(away, 5);
    expect(strokePetting(later, 'CHIN')).toBe(later);
  });

  it('that comes too fast makes the cat pull away, whatever the spot', () => {
    let round = at(IN);
    for (let stroke = 0; stroke < PACE.maxStrokes; stroke++)
      round = strokePetting(stepPetting(round, 2), 'CHIN');
    const calm = round.meter;
    expect(pettingAway(round)).toBe(false);
    const hurried = strokePetting(stepPetting(round, 2), 'CHIN');
    expect(hurried.meter).toBe(calm - METER.hurried);
    expect(hurried.last?.reaction).toBe('hurried');
    expect(hurried.counts.CHIN).toBe(PACE.maxStrokes);
    expect(pettingAway(hurried)).toBe(true);
  });

  it('at three a second is never too fast', () => {
    let round = at(IN);
    const gap = Math.ceil(PETTING.ticksPerSecond / 3);
    for (let tick = 0; tick < PETTING.roundTicks; tick += gap)
      round = strokePetting(at(tick, round), 'HEAD');
    expect(round.last?.reaction).toBe('fine');
    expect(round.counts.HEAD).toBe(Math.ceil(PETTING.roundTicks / gap));
  });

  it('keeps the meter within 0 and its maximum', () => {
    expect(strokePetting(at(IN), 'BELLY').meter).toBe(0);
    const full = playPetting(
      TASTES,
      [...onePerPurr('CHIN', 8), ...onePerPurr('CHIN', 8)].sort(
        (a, b) => a.tick - b.tick,
      ),
    );
    expect(full.meter).toBe(METER.max);
  });

  it('leaves the round it was given untouched', () => {
    const round = at(IN);
    const copy = structuredClone(round);
    strokePetting(round, 'CHIN');
    stepPetting(round, 3);
    expect(round).toEqual(copy);
  });
});

describe('a round', () => {
  it('lasts about twelve seconds and takes nothing after its end', () => {
    expect(PETTING.roundTicks / PETTING.ticksPerSecond).toBe(12);
    const end = at(PETTING.roundTicks - 1);
    expect(pettingDone(end)).toBe(false);
    const done = stepPetting(end, 5);
    expect(done.tick).toBe(PETTING.roundTicks);
    expect(pettingDone(done)).toBe(true);
    expect(strokePetting(done, 'CHIN')).toBe(done);
    expect(stepPetting(done, 1)).toBe(done);
  });

  it('is the same stepped at once or tick by tick', () => {
    const strokes = [
      { tick: 3, spot: 'CHIN' },
      { tick: 9, spot: 'HEAD' },
      { tick: 40, spot: 'BELLY' },
      { tick: 45, spot: 'CHIN' },
      { tick: 70, spot: 'BACK' },
    ] as const;
    let byTick: PettingRound = startPetting(TASTES);
    for (let tick = 0; tick < PETTING.roundTicks; tick++) {
      for (const stroke of strokes)
        if (stroke.tick === tick) byTick = strokePetting(byTick, stroke.spot);
      byTick = stepPetting(byTick, 1);
    }
    expect(playPetting(TASTES, strokes)).toEqual(byTick);
  });
});

describe('the outcome', () => {
  const outcome = (strokes: Parameters<typeof playPetting>[1]) =>
    pettingOutcome(playPetting(TASTES, strokes));

  it('gives the least mood for one light stroke', () => {
    expect(outcome([{ tick: OUT, spot: 'HEAD' }])).toEqual({
      meter: METER.neutral.other,
      good: false,
      mood: MOOD.min,
      spot: 'HEAD',
      touched: ['HEAD'],
    });
  });

  it('gives the most mood for a full meter', () => {
    const full = outcome(
      [...onePerPurr('CHIN', 8), ...onePerPurr('CHIN', 8)].sort(
        (a, b) => a.tick - b.tick,
      ),
    );
    expect(full).toMatchObject({ meter: 100, good: true, mood: MOOD.max });
  });

  it('grows with the meter in whole steps between the two', () => {
    const moods = [1, 2, 4, 6, 8].map(
      (strokes) => outcome(onePerPurr('CHIN', strokes)).mood,
    );
    expect(moods).toEqual([...moods].sort((a, b) => a - b));
    expect(new Set(moods).size).toBeGreaterThan(2);
    expect(Math.min(...moods)).toBeGreaterThanOrEqual(MOOD.min);
    expect(Math.max(...moods)).toBeLessThanOrEqual(MOOD.max);
  });

  it('is good from half a meter', () => {
    const strokes = Math.ceil(PETTING.good / METER.favourite.purring);
    expect(outcome(onePerPurr('CHIN', strokes)).good).toBe(true);
    expect(outcome(onePerPurr('CHIN', strokes - 1)).good).toBe(false);
  });

  it('costs a little mood when most strokes were on the disliked spot', () => {
    const mostly = outcome([
      { tick: 0, spot: 'CHIN' },
      { tick: 30, spot: 'BELLY' },
      { tick: 60, spot: 'BELLY' },
    ]);
    expect(mostly).toMatchObject({ mood: -MOOD.disliked, spot: 'BELLY' });
    const half = outcome([
      { tick: 0, spot: 'CHIN' },
      { tick: 30, spot: 'BELLY' },
    ]);
    expect(half.mood).toBeGreaterThanOrEqual(MOOD.min);
  });

  it('names the spot stroked most, the earlier listed on a tie, and every spot touched', () => {
    const round = outcome([
      { tick: 0, spot: 'BACK' },
      { tick: 30, spot: 'CHIN' },
      { tick: 60, spot: 'BACK' },
      { tick: 90, spot: 'CHIN' },
    ]);
    expect(round.spot).toBe('CHIN');
    expect(round.touched).toEqual(['CHIN', 'BACK']);
  });
});
