import { MAX_STAT } from './limits';
import { moodGain } from '../content/mood';
import type { CatEntity } from './schema';

/** Every mood gain goes through here, so a happy cat takes half of each (spec 038). */
export function liftMood(cat: CatEntity, amount: number): void {
  cat.mood = Math.min(MAX_STAT, cat.mood + moodGain(cat.mood, amount));
}
