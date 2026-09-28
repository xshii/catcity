import type { CatEntity } from './schema';
export function rewardBond(cat: CatEntity, minute: number) {
  if (cat.lastBondMinute === null || minute - cat.lastBondMinute >= 60) {
    cat.playerBond = Math.min(100, cat.playerBond + 1);
    cat.lastBondMinute = minute;
  }
}
