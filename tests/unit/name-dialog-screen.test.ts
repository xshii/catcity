import { describe, expect, it } from 'vitest';
import {
  residentIdentity,
  suggestNames,
  type WorldState,
} from '../../src/core';
import {
  nameDialogScreen,
  typedName,
  type NameDialogInput,
} from '../../src/view/cats/name-dialog-screen';
import { invite } from '../helpers/world';
import { createWorld } from '../../src/core';

// Spec 041 R-16 (ui-design 5.4 "起名的交互"): what the name box shows and gives.

const pair = (() => {
  const world = createWorld(42);
  invite(world);
  return world.getSnapshot();
})();
/** Renaming Mochi: its own name in the box at first. */
const RENAME: NameDialogInput = {
  title: '给 Mochi 改个名字',
  confirm: '就叫这个',
  initial: 'Mochi',
  salt: 0,
};
const first = suggestNames(pair, 0, 0)[0]!;
const screen = (text: string, page = 0, world: WorldState = pair) =>
  nameDialogScreen(world, RENAME, text, page);

describe('the name box (ui-design 5.4)', () => {
  it('shows the six suggestions of the page, the one in the box marked', () => {
    const page = suggestNames(pair, 0, 1);
    const shown = screen(page[2]!, 1);
    expect(shown.suggestions.map((item) => item.name)).toEqual(page);
    expect(shown.suggestions.map((item) => item.checked)).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
    // Spaces around the typed name do not count.
    expect(screen(` ${page[0]} `, 1).suggestions[0]!.checked).toBe(true);
    expect(screen('Mochi', 1).suggestions.some((item) => item.checked)).toBe(
      false,
    );
  });

  it('gives the typed name without spaces at its ends', () => {
    expect(screen('  团子 ').name).toBe('团子');
    expect(screen('  团子 ').note).toBe('');
  });

  it('left blank, gives the first suggestion of the first page, and says so', () => {
    for (const text of ['', '   '])
      for (const page of [0, 3]) {
        const shown = screen(text, page);
        expect(shown.name).toBe(first);
        expect(shown.note).toBe(`不填的话就叫 ${first}`);
      }
  });

  it('warns of a namesake in the city, but not of the cat’s own name', () => {
    expect(screen('Pepper').note).toBe('城里已经有一只Pepper了');
    expect(screen('Pepper').name).toBe('Pepper');
    expect(screen('Mochi').note).toBe('');
    // Another cat with the same name is a namesake.
    const twins = {
      ...pair,
      cats: pair.cats.map((cat) => ({ ...cat, name: 'Mochi' })),
    };
    expect(screen('Mochi', 0, twins).note).toBe('城里已经有一只Mochi了');
  });

  it('warns of a resident with the same name (T-30)', () => {
    const lodged: WorldState = {
      ...pair,
      residents: [{ id: 'resident-1', home: 'building-1', arrivedMinute: 0 }],
    };
    const name = residentIdentity(pair.seed, 'resident-1').name;
    expect(screen(name, 0, lodged).note).toBe(`城里已经有一只${name}了`);
    expect(screen(name, 0, pair).note).toBe('');
  });

  it('says a name has at most 12 characters once it has them', () => {
    expect(screen('一二三四五六七八九十一').note).toBe('');
    expect(screen('一二三四五六七八九十一二').note).toBe('名字最多 12 个字');
  });
});

describe('a kitten’s sex in the name box (T-22, user 2026-09-30)', () => {
  const KITTEN: NameDialogInput = {
    title: '给小猫起个名字',
    confirm: '就叫这个',
    initial: first,
    salt: 0,
    askSex: true,
  };
  const kitten = (sex: 'F' | 'M' | null) =>
    nameDialogScreen(pair, KITTEN, first, 0, sex);

  it('offers 公 and 母 with neither chosen, and confirms only once one is', () => {
    expect(kitten(null).sex).toEqual({
      choices: [
        { value: 'M', text: '♂ 公', label: '公猫', checked: false },
        { value: 'F', text: '♀ 母', label: '母猫', checked: false },
      ],
      note: '先选：公猫还是母猫',
    });
    expect(kitten(null).ready).toBe(false);
    expect(kitten('F').sex!.choices.map((choice) => choice.checked)).toEqual([
      false,
      true,
    ]);
    expect(kitten('F').sex!.note).toBe('');
    expect(kitten('F').ready).toBe(true);
  });

  it('is not asked in a rename, which confirms at once', () => {
    expect(screen('Mochi').sex).toBeNull();
    expect(screen('Mochi').ready).toBe(true);
  });
});

describe('what the box keeps of typed text', () => {
  it('drops line breaks and other control characters, and keeps 12 characters', () => {
    expect(typedName('团\n子\t')).toBe('团子');
    expect(typedName('一二三四五六七八九十一二三四')).toBe(
      '一二三四五六七八九十一二',
    );
    // An emoji is one character, as the player counts it.
    expect(typedName('🐟'.repeat(13))).toBe('🐟'.repeat(12));
    expect(typedName(' 团子 ')).toBe(' 团子 ');
  });
});
