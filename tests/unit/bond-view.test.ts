import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/core/world';
import type { WorldState } from '../../src/core';
import { bondBadge, bondNote, outcomeNote } from '../../src/view/shell/bond';
import { toViewModel } from '../../src/view/shell/model';

const withCat = (playerBond: number, mood = 70): WorldState => {
  const world = createWorld(42).getSnapshot();
  Object.assign(world.cats[0]!, { playerBond, mood });
  return world;
};

describe('bond level in the cats panel (spec 036)', () => {
  it('shows the level name, a heart per level reached and the way to the next', () => {
    expect(bondBadge(0)).toEqual({
      level: 0,
      name: '初识',
      hearts: '♡♡♡♡',
      progress: { value: 0, max: 5 },
      next: '距「熟悉」还差 5',
      label: '关系：初识，距「熟悉」还差 5',
    });
    expect(bondBadge(7)).toEqual({
      level: 1,
      name: '熟悉',
      hearts: '♥♡♡♡',
      progress: { value: 2, max: 10 },
      next: '距「信任」还差 8',
      label: '关系：熟悉，距「信任」还差 8',
    });
    expect(bondBadge(59)).toMatchObject({
      name: '亲密',
      hearts: '♥♥♥♡',
      progress: { value: 29, max: 30 },
      next: '距「家人」还差 1',
    });
  });

  it('shows a full bar and no next level for family', () => {
    for (const bond of [60, 100])
      expect(bondBadge(bond)).toEqual({
        level: 4,
        name: '家人',
        hearts: '♥♥♥♥',
        progress: { value: 1, max: 1 },
        next: '已经是一家人了',
        label: '关系：家人，已经是一家人了',
      });
  });

  it('the view model carries the selected cat’s bond badge', () => {
    expect(toViewModel(withCat(15), 'mochi').cat?.bondBadge).toEqual(
      bondBadge(15),
    );
    expect(toViewModel(withCat(15), null).cat).toBeNull();
  });
});

describe('a level reached, told once with the outcome that reached it', () => {
  it('says nothing while the level stays the same', () => {
    expect(bondNote(withCat(3), withCat(4), 'mochi')).toBe('');
    expect(bondNote(withCat(5), withCat(5), 'mochi')).toBe('');
    expect(bondNote(withCat(5), withCat(6), 'mochi')).toBe('');
  });

  it('names the cat and the new level when the bond crosses a threshold', () => {
    expect(bondNote(withCat(4), withCat(5), 'mochi')).toBe(
      '和 Mochi 更熟了：熟悉',
    );
    expect(bondNote(withCat(14), withCat(15), 'mochi')).toBe(
      '和 Mochi 更熟了：信任',
    );
    expect(bondNote(withCat(59), withCat(60), 'mochi')).toBe(
      '和 Mochi 更熟了：家人',
    );
  });

  it('says nothing for a lower level or a cat that is not in both snapshots', () => {
    expect(bondNote(withCat(15), withCat(14), 'mochi')).toBe('');
    expect(bondNote(withCat(4), withCat(5), 'pepper')).toBe('');
  });

  it('joins the mood and the bond clause of one outcome', () => {
    expect(outcomeNote(withCat(4, 70), withCat(4, 73), 'mochi')).toBe('');
    expect(outcomeNote(withCat(4, 78), withCat(4, 81), 'mochi')).toBe(
      'Mochi 心情好起来了（开心）',
    );
    expect(outcomeNote(withCat(4, 70), withCat(5, 73), 'mochi')).toBe(
      '和 Mochi 更熟了：熟悉',
    );
    expect(outcomeNote(withCat(4, 78), withCat(5, 81), 'mochi')).toBe(
      'Mochi 心情好起来了（开心）。和 Mochi 更熟了：熟悉',
    );
  });
});
