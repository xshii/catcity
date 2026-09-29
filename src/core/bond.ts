import { MAX_STAT } from './limits';
import { CARE } from '../content/care';
import type { CatEntity } from './schema';
/** Grows the bond at most once per cooldown; returns whether it grew this time. */
export function rewardBond(cat: CatEntity, minute: number): boolean {
  if (
    cat.lastBondMinute !== null &&
    minute - cat.lastBondMinute < CARE.bondCooldownMinutes
  )
    return false;
  cat.playerBond = Math.min(MAX_STAT, cat.playerBond + 1);
  cat.lastBondMinute = minute;
  return true;
}
