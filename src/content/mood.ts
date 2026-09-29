import { bondLevel } from './care';

/**
 * Mood tuning (specs 032, 038): every change a cat's mood (0–100) takes, and the small bonus a
 * happy cat brings to a run. Losses are magnitudes. Mood never cuts rewards or blocks play.
 */
export const MOOD = {
  /** Each full game hour mood drifts `drift` toward `rest`, never past it. */
  tickMinutes: 60,
  rest: 60,
  /** Each bond level above the first lifts that cat's resting mood (spec 036). */
  restPerBondLevel: 3,
  drift: 2,
  /** The drift of a mood above `happy` (spec 038): happiness is earned, not kept. */
  highDrift: 4,
  /** Extra each full hour for a cat beside its own apartment. */
  home: 1,
  /** A chat, at most once per `chatCooldownMinutes` for each cat. */
  chat: 2,
  chatCooldownMinutes: 60,
  catch: 5,
  gift: 3,
  favoriteGift: 8,
  /** A run that ends with the fish getting away (a cancel does not). */
  escape: 3,
  /** A walking cat whose energy runs out. */
  exhausted: 5,
  /** A cat at least this happy makes its next run a happy one. */
  happy: 80,
  /** Happy runs: a larger motion ring, a longer strike window, a wider button zone. */
  bonus: { ringRadius: 1, strikeWindowTicks: 2, greenZone: 4 },
} as const;

export type MoodBand = 'happy' | 'calm' | 'glum' | 'low';

/** 开心 ≥80, 平静 50–79, 有点闷 30–49, 低落 <30. */
export function moodBand(mood: number): MoodBand {
  if (mood >= MOOD.happy) return 'happy';
  if (mood >= 50) return 'calm';
  if (mood >= 30) return 'glum';
  return 'low';
}

/** What a gain adds at this mood: a happy cat takes half, rounded down, at least 1. */
export function moodGain(mood: number, amount: number): number {
  return mood >= MOOD.happy ? Math.max(1, Math.floor(amount / 2)) : amount;
}

/** The mood a cat with this bond drifts toward: 60 for a new friend, 72 for family. */
export function moodRest(playerBond: number): number {
  return MOOD.rest + bondLevel(playerBond) * MOOD.restPerBondLevel;
}
