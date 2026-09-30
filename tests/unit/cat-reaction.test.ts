import { describe, expect, it } from 'vitest';
import type { MoodBand } from '../../src/content/mood';
import type { AnglingRun } from '../../src/minigames/angling';
import {
  CAT_LINES,
  catReaction,
  shownCatch,
} from '../../src/view/fishing/screen';
import {
  initialFishingView,
  type FishingViewEvent,
} from '../../src/view/fishing/view-state';
import { replay } from '../helpers/fishing-view';

const BANDS: MoodBand[] = ['happy', 'calm', 'glum', 'low'];
const PHASES: (AnglingRun['phase'] | null)[] = [
  null,
  'charge',
  'waiting',
  'hook',
  'fight',
];
/** Both lines of a group, as two taps in a row get them. */
const said = (reaction: Omit<Parameters<typeof catReaction>[0], 'count'>) =>
  [0, 1].map((count) => catReaction({ ...reaction, count }).line);

describe('the cat beside the player answers a tap (R-03)', () => {
  it('speaks its mood while aiming or between casts, tilting its head', () => {
    for (const band of BANDS)
      for (const phase of [null, 'charge'] as const) {
        expect(said({ band, phase, result: null })).toEqual(
          CAT_LINES.idle[band],
        );
        expect(
          catReaction({ band, phase, result: null, count: 0 }).motion,
        ).toBe('tilt');
      }
    // Each mood its own words.
    expect(new Set(BANDS.flatMap((band) => CAT_LINES.idle[band])).size).toBe(
      BANDS.length * 2,
    );
  });

  it('whispers while the float waits, keeping still; cheers a bite and a fight on', () => {
    for (const band of BANDS) {
      expect(said({ band, phase: 'waiting', result: null })).toEqual(
        CAT_LINES.waiting,
      );
      expect(
        catReaction({ band, phase: 'waiting', result: null, count: 0 }).motion,
      ).toBe('none');
      for (const phase of ['hook', 'fight'] as const) {
        expect(said({ band, phase, result: null })).toEqual(CAT_LINES.cheer);
        expect(
          catReaction({ band, phase, result: null, count: 1 }).motion,
        ).toBe('tilt');
      }
    }
  });

  it('is glad of the catch just shown with a hop, and kind about one that got away', () => {
    for (const band of BANDS) {
      expect(said({ band, phase: null, result: 'caught' })).toEqual(
        CAT_LINES.caught,
      );
      expect(
        catReaction({ band, phase: null, result: 'caught', count: 0 }).motion,
      ).toBe('hop');
      expect(said({ band, phase: null, result: 'escaped' })).toEqual(
        CAT_LINES.escaped,
      );
      expect(
        catReaction({ band, phase: null, result: 'escaped', count: 0 }).motion,
      ).toBe('tilt');
    }
  });

  it('takes turns between its two lines as the taps go on', () => {
    for (const band of BANDS)
      for (const phase of PHASES) {
        const line = (count: number) =>
          catReaction({ band, phase, result: null, count }).line;
        expect(line(0)).not.toBe(line(1));
        expect(line(2)).toBe(line(0));
        expect(line(7)).toBe(line(1));
      }
  });

  it('says every line in a bubble of a line and a half: two to a moment, at most 14 characters', () => {
    const groups = [
      ...BANDS.map((band) => CAT_LINES.idle[band]),
      CAT_LINES.waiting,
      CAT_LINES.cheer,
      CAT_LINES.caught,
      CAT_LINES.escaped,
    ];
    for (const lines of groups) {
      expect(lines).toHaveLength(2);
      for (const line of lines) {
        expect(line.length).toBeGreaterThan(0);
        expect([...line].length).toBeLessThanOrEqual(14);
      }
    }
    expect(CAT_LINES.label('Mochi')).toBe('摸摸 Mochi');
  });
});

describe('the catch the cat talks about', () => {
  const river: FishingViewEvent = { type: 'place', place: 'river' };
  const watched = replay(
    initialFishingView({
      preference: 'buttons',
      needsPermission: false,
      coarsePointer: false,
      guide: null,
      autoCalibrate: false,
    }),
    river,
    { type: 'run', runId: 'r' },
    { type: 'run', runId: null },
  );
  const caught = { runId: 'r', caught: true };
  const lost = { runId: 'r', caught: false };

  it('is the result on the catch card: caught or got away', () => {
    expect(shownCatch(watched, null, caught)).toBe('caught');
    expect(shownCatch(watched, null, lost)).toBe('escaped');
  });

  it('is none without the card: a save’s old result, a new run, or a notice over it', () => {
    expect(shownCatch(watched, null, null)).toBeNull();
    expect(shownCatch(watched, null, { ...caught, runId: 'old' })).toBeNull();
    const next = replay(watched, { type: 'run', runId: 'next' });
    expect(
      shownCatch(next, { phase: 'waiting' } as AnglingRun, caught),
    ).toBeNull();
    expect(shownCatch(replay(watched, { type: 'said' }), null, caught)).toBe(
      null,
    );
  });
});
