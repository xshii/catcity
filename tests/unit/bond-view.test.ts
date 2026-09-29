import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/core/world';
import { MAX_BOND, type WorldState } from '../../src/core';
import { BOND_LEVELS } from '../../src/content/care';
import {
  giftNotice,
  bondBadge,
  bondNote,
  outcomeNote,
} from '../../src/view/shell/bond';
import { toViewModel } from '../../src/view/shell/model';

const withCat = (playerBond: number, mood = 70): WorldState => {
  const world = createWorld(42).getSnapshot();
  Object.assign(world.cats[0]!, { playerBond, mood });
  return world;
};

/** Thresholds are tuning: every test reads them from the content table. */
const at = (level: number) => BOND_LEVELS[level]!.bond;
const top = BOND_LEVELS.length - 1;
const hearts = (level: number) => '♥'.repeat(level) + '♡'.repeat(top - level);

describe('bond level in the cats panel (spec 036)', () => {
  it('shows the level name, a heart per level reached and the way to the next', () => {
    for (let level = 0; level < top; level++) {
      const next = BOND_LEVELS[level + 1]!;
      const span = next.bond - at(level);
      const words = (left: number) => `距「${next.name}」还差 ${left}`;
      expect(bondBadge(at(level))).toEqual({
        level,
        name: BOND_LEVELS[level]!.name,
        hearts: hearts(level),
        progress: { value: 0, max: span },
        next: words(span),
        label: `关系：${BOND_LEVELS[level]!.name}，${words(span)}`,
      });
      expect(bondBadge(next.bond - 1)).toMatchObject({
        level,
        progress: { value: span - 1, max: span },
        next: words(1),
      });
    }
  });

  it('shows a full bar and no next level at the last one', () => {
    for (const bond of [at(top), MAX_BOND])
      expect(bondBadge(bond)).toEqual({
        level: top,
        name: BOND_LEVELS[top]!.name,
        hearts: hearts(top),
        progress: { value: 1, max: 1 },
        next: '已经是一家人了',
        label: `关系：${BOND_LEVELS[top]!.name}，已经是一家人了`,
      });
  });

  it('the view model carries the selected cat’s bond badge', () => {
    expect(toViewModel(withCat(at(2)), 'mochi').cat?.bondBadge).toEqual(
      bondBadge(at(2)),
    );
    expect(toViewModel(withCat(at(2)), null).cat).toBeNull();
  });
});

describe('a level reached, told once with the outcome that reached it', () => {
  const reached = (level: number) =>
    `和 Mochi 更熟了：${BOND_LEVELS[level]!.name}`;

  it('says nothing while the level stays the same', () => {
    expect(bondNote(withCat(at(1) - 2), withCat(at(1) - 1), 'mochi')).toBe('');
    expect(bondNote(withCat(at(1)), withCat(at(1)), 'mochi')).toBe('');
    expect(bondNote(withCat(at(1)), withCat(at(1) + 1), 'mochi')).toBe('');
  });

  it('names the cat and the new level when the bond crosses a threshold', () => {
    for (let level = 1; level <= top; level++)
      expect(
        bondNote(withCat(at(level) - 1), withCat(at(level)), 'mochi'),
      ).toBe(reached(level));
  });

  it('says nothing for a lower level or a cat that is not in both snapshots', () => {
    expect(bondNote(withCat(at(2)), withCat(at(2) - 1), 'mochi')).toBe('');
    expect(bondNote(withCat(at(1) - 1), withCat(at(1)), 'pepper')).toBe('');
  });

  it('joins the mood and the bond clause of one outcome', () => {
    const [before, after] = [at(1) - 1, at(1)];
    expect(outcomeNote(withCat(before, 70), withCat(before, 73), 'mochi')).toBe(
      '',
    );
    expect(outcomeNote(withCat(before, 78), withCat(before, 81), 'mochi')).toBe(
      'Mochi 心情好起来了（开心）',
    );
    expect(outcomeNote(withCat(before, 70), withCat(after, 73), 'mochi')).toBe(
      reached(1),
    );
    expect(outcomeNote(withCat(before, 78), withCat(after, 81), 'mochi')).toBe(
      `Mochi 心情好起来了（开心）。${reached(1)}`,
    );
  });
});

describe('a gift past the day’s allowance', () => {
  const withGifts = (count: number): WorldState => {
    const world = withCat(0);
    world.cats[0]!.giftBond = count ? { day: 0, count } : null;
    return world;
  };

  it('keeps the usual words while gifts count', () => {
    expect(giftNotice('收到了', withGifts(0), withGifts(1), 'mochi')).toBe(
      '收到了',
    );
    expect(giftNotice('收到了', withGifts(2), withGifts(3), 'mochi')).toBe(
      '收到了',
    );
  });

  it('says kindly that the cat has had enough today', () => {
    expect(giftNotice('收到了', withGifts(3), withGifts(3), 'mochi')).toBe(
      'Mochi 今天已经吃饱啦，这条先收下，明天再好好谢你。',
    );
  });
});
