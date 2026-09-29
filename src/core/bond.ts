import { MAX_BOND } from './limits';
import { BOND } from '../content/care';
import { MOOD } from '../content/mood';
import type { CatEntity } from './schema';

/** Uses of a per-day allowance; a new game day starts the count again. */
export type DailyCount = { day: number; count: number };

export const gameDay = (minute: number) => Math.floor(minute / BOND.dayMinutes);

/** A source's points, one more for a cat that is happy now; the bond never falls. */
export function rewardBond(cat: CatEntity, points: number): void {
  const bonus = cat.mood >= MOOD.happy ? BOND.happy : 0;
  cat.playerBond = Math.min(MAX_BOND, cat.playerBond + points + bonus);
}

/** One more use of a daily allowance, or null once today's `limit` is used up. */
export function spendDaily(
  used: DailyCount | null,
  minute: number,
  limit: number,
): DailyCount | null {
  const day = gameDay(minute);
  const count = used?.day === day ? used.count : 0;
  return count < limit ? { day, count: count + 1 } : null;
}
