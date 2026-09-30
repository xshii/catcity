import { moodBand, type MoodBand } from '../../content/mood';
import type { WorldState } from '../../core';

/** Player-facing words for a cat's mood (spec 032); the bands come from content. */
export const MOOD_COPY = {
  bands: {
    happy: { glyph: '😸', label: '开心' },
    calm: { glyph: '😺', label: '平静' },
    glum: { glyph: '😾', label: '有点闷' },
    low: { glyph: '😿', label: '低落' },
  } satisfies Record<MoodBand, { glyph: string; label: string }>,
  happyHint: '开心：遛鱼圈更大，经验更多',
  rose: '心情好起来了',
  fell: '心情落了一点',
} as const;

/** A cat's band as shown on cards: glyph + words, a plain-text label, the happy hint. */
export function moodBadge(mood: number) {
  const band = moodBand(mood);
  const { glyph, label } = MOOD_COPY.bands[band];
  return {
    band,
    text: `${glyph} ${label}`,
    label: `心情：${label}`,
    hint: band === 'happy' ? MOOD_COPY.happyHint : '',
  };
}

/** One short clause when the cat's band changed between two snapshots, else ''. */
export function moodNote(
  previous: WorldState,
  next: WorldState,
  catId: string,
): string {
  const before = previous.cats.find((cat) => cat.id === catId);
  const after = next.cats.find((cat) => cat.id === catId);
  if (!before || !after || moodBand(before.mood) === moodBand(after.mood))
    return '';
  const change = after.mood > before.mood ? MOOD_COPY.rose : MOOD_COPY.fell;
  return `${after.name} ${change}（${MOOD_COPY.bands[moodBand(after.mood)].label}）`;
}

export function withMoodNote(message: string, note: string): string {
  return note ? `${message}${note}。` : message;
}
