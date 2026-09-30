import { BOND_LEVELS, bondLevel } from '../../content/care';
import type { WorldState } from '../../core';
import { moodNote } from './mood';

/** A cat's bond level as shown on cards (spec 036); levels and names come from content. */
export function bondBadge(playerBond: number) {
  const level = bondLevel(playerBond);
  const { name, bond: from } = BOND_LEVELS[level]!;
  const target = BOND_LEVELS[level + 1];
  const next = target
    ? `距「${target.name}」还差 ${target.bond - playerBond}`
    : '已经是一家人了';
  return {
    level,
    name,
    /** One heart per level above the first. */
    hearts: '♥'.repeat(level) + '♡'.repeat(BOND_LEVELS.length - 1 - level),
    /** The way through the current level; full at the last one. */
    progress: target
      ? { value: playerBond - from, max: target.bond - from }
      : { value: 1, max: 1 },
    next,
    label: `关系：${name}，${next}`,
  };
}

/** One short clause when the cat reached a higher level between two snapshots, else ''. */
export function bondNote(
  previous: WorldState,
  next: WorldState,
  catId: string,
): string {
  const before = previous.cats.find((cat) => cat.id === catId);
  const after = next.cats.find((cat) => cat.id === catId);
  if (!before || !after) return '';
  const level = bondLevel(after.playerBond);
  return level > bondLevel(before.playerBond)
    ? `和 ${after.name} 更熟了：${BOND_LEVELS[level]!.name}`
    : '';
}

/** What one command's outcome changed for the cat: its mood band, then a level reached. */
export function outcomeNote(
  previous: WorldState,
  next: WorldState,
  catId: string,
): string {
  return [moodNote, bondNote]
    .map((note) => note(previous, next, catId))
    .filter(Boolean)
    .join('。');
}

/**
 * The words for a gift: the usual ones while gifts count, kind ones once the cat has had
 * the day's share (spec 038). Told from the gift count of the two snapshots.
 */
export function giftNotice(
  usual: string,
  previous: WorldState,
  next: WorldState,
  catId: string,
): string {
  const before = previous.cats.find((cat) => cat.id === catId);
  const after = next.cats.find((cat) => cat.id === catId);
  if (!before || !after) return usual;
  const counted =
    after.giftBond !== null &&
    (before.giftBond?.day !== after.giftBond.day ||
      before.giftBond.count !== after.giftBond.count);
  return counted
    ? usual
    : `${after.name} 今天已经吃饱啦，这条先收下，明天再好好谢你。`;
}
