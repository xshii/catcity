import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/core/world';
import type { WorldState } from '../../src/core';
import {
  MOOD_COPY,
  moodBadge,
  moodNote,
  withMoodNote,
} from '../../src/view/common/mood';
import { toViewModel } from '../../src/view/common/model';

const withMood = (mood: number): WorldState => {
  const world = createWorld(42).getSnapshot();
  world.cats[0]!.mood = mood;
  return world;
};

describe('mood in the cats panel (spec 032)', () => {
  it('shows each band from content with a glyph, plain words and the happy hint', () => {
    expect([100, 80, 79, 50, 49, 30, 29, 0].map(moodBadge)).toEqual([
      ...[100, 80].map(() => ({
        band: 'happy',
        text: `${MOOD_COPY.bands.happy.glyph} 开心`,
        label: '心情：开心',
        hint: '开心：遛鱼圈更大，经验更多',
      })),
      ...[79, 50].map(() => ({
        band: 'calm',
        text: `${MOOD_COPY.bands.calm.glyph} 平静`,
        label: '心情：平静',
        hint: '',
      })),
      ...[49, 30].map(() => ({
        band: 'glum',
        text: `${MOOD_COPY.bands.glum.glyph} 有点闷`,
        label: '心情：有点闷',
        hint: '',
      })),
      ...[29, 0].map(() => ({
        band: 'low',
        text: `${MOOD_COPY.bands.low.glyph} 低落`,
        label: '心情：低落',
        hint: '',
      })),
    ]);
  });

  it('every band has its own glyph and words', () => {
    const bands = Object.values(MOOD_COPY.bands);
    expect(new Set(bands.map((band) => band.glyph)).size).toBe(bands.length);
    expect(new Set(bands.map((band) => band.label)).size).toBe(bands.length);
  });

  it('the view model carries the selected cat’s mood badge', () => {
    expect(toViewModel(withMood(85), 'mochi').cat?.moodBadge).toEqual(
      moodBadge(85),
    );
    expect(toViewModel(withMood(40), 'mochi').cat?.moodBadge.text).toContain(
      '有点闷',
    );
    expect(toViewModel(withMood(40), null).cat).toBeNull();
  });
});

describe('mood changes in results and gift messages', () => {
  it('says nothing while the band stays the same', () => {
    expect(moodNote(withMood(70), withMood(73), 'mochi')).toBe('');
    expect(moodNote(withMood(60), withMood(57), 'mochi')).toBe('');
  });

  it('names the cat, the direction and the new band when it changes', () => {
    expect(moodNote(withMood(78), withMood(81), 'mochi')).toBe(
      'Mochi 心情好起来了（开心）',
    );
    expect(moodNote(withMood(80), withMood(77), 'mochi')).toBe(
      'Mochi 心情落了一点（平静）',
    );
    expect(moodNote(withMood(31), withMood(28), 'mochi')).toBe(
      'Mochi 心情落了一点（低落）',
    );
  });

  it('says nothing for a cat that is not in both snapshots', () => {
    expect(moodNote(withMood(78), withMood(81), 'pepper')).toBe('');
  });

  it('adds the clause to a message only when there is one', () => {
    expect(withMoodNote('收到了银鱼。', '')).toBe('收到了银鱼。');
    expect(withMoodNote('收到了银鱼。', 'Mochi 心情好起来了（开心）')).toBe(
      '收到了银鱼。Mochi 心情好起来了（开心）。',
    );
  });
});
