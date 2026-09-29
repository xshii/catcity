import { MAX_STAT } from './limits';
import { MOOD, moodGain } from '../content/mood';
import type { CatEntity } from './schema';

/** Every mood gain goes through here, so a happy cat takes half of each (spec 038). */
export function liftMood(cat: CatEntity, amount: number): void {
  cat.mood = Math.min(MAX_STAT, cat.mood + moodGain(cat.mood, amount));
}

/** A lift that stops just under the happy line and leaves a happy cat as it is. */
export function liftCalmMood(cat: CatEntity, amount: number): void {
  cat.mood = Math.max(cat.mood, Math.min(MOOD.happy - 1, cat.mood + amount));
}
