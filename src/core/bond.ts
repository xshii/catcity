import { MAX_STAT } from './limits';
import { CARE } from '../content/care';
import type { CatEntity } from './schema';
export function rewardBond(cat: CatEntity, minute: number) {
  if (
    cat.lastBondMinute === null ||
    minute - cat.lastBondMinute >= CARE.bondCooldownMinutes
  ) {
    cat.playerBond = Math.min(MAX_STAT, cat.playerBond + 1);
    cat.lastBondMinute = minute;
  }
}
