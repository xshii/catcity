import { describe, expect, it } from 'vitest';
import {
  CAT_NAMES,
  NAME_MAX_LENGTH,
  SUGGESTED_NAMES,
} from '../../src/content/names';
import { RESIDENT_NAMES } from '../../src/content/residents';
import {
  createWorld,
  loadWorld,
  nameSalt,
  residentIdentity,
  suggestNames,
  type World,
  type WorldState,
} from '../../src/core';
import { createTestSession } from '../helpers/session';
import { fullCity, invite } from '../helpers/world';

// Spec 041 R-16 (design 5.2.1): names, suggested names and renaming.

const rename = (world: World, catId: string, name: string) =>
  world.dispatch({ type: 'RENAME_CAT', catId, name });
/** The world with its first cats named `names`, in order. */
const named = (world: WorldState, names: readonly string[]): WorldState => ({
  ...world,
  cats: world.cats.map((cat, i) => ({ ...cat, name: names[i] ?? cat.name })),
});
const TWELVE = '一二三四五六七八九十一二';
/** Out of bounds: empty, only spaces, a line break, a tab, 13 characters, a space at an end. */
const BAD_NAMES = [
  '',
  '   ',
  '团\n子',
  '团\t子',
  `${TWELVE}三`,
  ' 团子',
  '团子 ',
];

describe('the names table', () => {
  it('holds about sixty different short names, two or three characters each', () => {
    expect(CAT_NAMES).toHaveLength(60);
    expect(new Set(CAT_NAMES).size).toBe(CAT_NAMES.length);
    for (const name of CAT_NAMES)
      expect([2, 3], name).toContain(Array.from(name).length);
    expect(NAME_MAX_LENGTH).toBe(12);
    expect(SUGGESTED_NAMES).toBe(6);
  });
});

describe('suggested names (design 5.2.1)', () => {
  const world = createWorld(42).getSnapshot();

  it('are six different names of the table, the same for the same world, salt and page', () => {
    const six = suggestNames(world, 0, 0);
    expect(six).toHaveLength(6);
    expect(new Set(six).size).toBe(6);
    for (const name of six) expect(CAT_NAMES).toContain(name);
    expect(suggestNames(createWorld(42).getSnapshot(), 0, 0)).toEqual(six);
    // Another cat, or another world, is offered other names first.
    expect(suggestNames(world, 7, 0)).not.toEqual(six);
    expect(suggestNames(createWorld(43).getSnapshot(), 0, 0)).not.toEqual(six);
  });

  it('leave out every name a cat in the city has', () => {
    const city = named(fullCity().getSnapshot(), suggestNames(world, 3, 0));
    const taken = new Set(city.cats.map((cat) => cat.name));
    const offered = Array.from({ length: 9 }, (_, page) =>
      suggestNames(city, 3, page),
    ).flat();
    expect(offered.filter((name) => taken.has(name))).toEqual([]);
    // Nine pages offer each of the 54 names left once.
    expect(new Set(offered).size).toBe(CAT_NAMES.length - 6);
  });

  it('leave out every resident’s name too (T-30)', () => {
    // Residents 1 to 24 of seed 42 hold every name of theirs, 可可 among them.
    const lodged: WorldState = {
      ...world,
      residents: RESIDENT_NAMES.map((_, i) => ({
        id: `resident-${i + 1}`,
        home: 'building-1',
        arrivedMinute: 0,
      })),
    };
    const names = lodged.residents.map(
      ({ id }) => residentIdentity(lodged.seed, id).name,
    );
    expect(new Set(names)).toEqual(new Set(RESIDENT_NAMES));
    const offered = (city: WorldState) =>
      Array.from({ length: 10 }, (_, page) =>
        suggestNames(city, 0, page),
      ).flat();
    expect(offered(world)).toContain('可可');
    expect(offered(lodged).filter((name) => names.includes(name))).toEqual([]);
    // The one name both tables have is gone; the other 59 still come round.
    expect(new Set(offered(lodged)).size).toBe(CAT_NAMES.length - 1);
  });

  it('turn page by page without a repeat until the table is used up, then start over', () => {
    const pages = CAT_NAMES.length / SUGGESTED_NAMES;
    const all = Array.from({ length: pages }, (_, page) =>
      suggestNames(world, 0, page),
    );
    expect(new Set(all.flat()).size).toBe(CAT_NAMES.length);
    expect(suggestNames(world, 0, pages)).toEqual(all[0]);
    // With one name taken the last page is short of one: it ends with the first name.
    const one = named(world, [CAT_NAMES[0]]);
    const short = Array.from({ length: pages }, (_, page) =>
      suggestNames(one, 0, page),
    );
    expect(new Set(short.slice(0, -1).flat()).size).toBe(54);
    expect(new Set(short.flat()).size).toBe(59);
    expect(short.at(-1)!.at(-1)).toBe(short[0]![0]);
    expect(suggestNames(one, 0, pages)).toEqual(short[0]);
  });

  it('shuffle by a cat’s id serial, Mochi’s being 0', () => {
    expect(nameSalt('mochi')).toBe(0);
    expect(nameSalt('cat-12')).toBe(12);
  });
});

describe('RENAME_CAT (R-16)', () => {
  it('gives a companion a new name, free and as often as wished, and changes nothing else', () => {
    const world = createWorld(42);
    const before = world.getSnapshot();
    expect(rename(world, 'mochi', '团子')).toEqual({
      ok: true,
      events: [
        { type: 'CatRenamed', minute: before.minute, entityId: 'mochi' },
      ],
    });
    expect(world.getSnapshot()).toEqual({
      ...before,
      cats: [{ ...before.cats[0]!, name: '团子' }],
    });
    expect(rename(world, 'mochi', TWELVE).ok).toBe(true);
    expect(rename(world, 'mochi', '🐟'.repeat(12)).ok).toBe(true);
    expect(rename(world, 'mochi', 'Mochi Jr').ok).toBe(true);
    // Two cats may share a name.
    const pepper = invite(world);
    const coins = world.getSnapshot().coins;
    expect(rename(world, pepper.id, 'Mochi Jr').ok).toBe(true);
    expect(world.getSnapshot().coins).toBe(coins);
    expect(loadWorld(world.save()).save()).toBe(world.save());
  });

  it('rejects the same name, a name out of bounds and anyone not a companion, leaving the world unchanged', () => {
    const world = createWorld(42);
    const rejects = (catId: string, name: string, error: string) => {
      const saved = world.save();
      expect(rename(world, catId, name), JSON.stringify(name)).toEqual({
        ok: false,
        error,
      });
      expect(world.save()).toBe(saved);
    };
    rejects('mochi', 'Mochi', 'NAME_UNCHANGED');
    for (const name of [...BAD_NAMES, '🐟'.repeat(13)])
      rejects('mochi', name, 'INVALID_COMMAND');
    // Only a cat on the roster: residents (T-30) and anything else are not found.
    rejects('resident-1', '团子', 'CAT_NOT_FOUND');
  });

  it('holds a saved name to the same bounds', () => {
    const save = JSON.parse(createWorld(42).save());
    for (const name of BAD_NAMES) {
      save.world.cats[0].name = name;
      expect(() => loadWorld(JSON.stringify(save)), name).toThrow();
    }
    save.world.cats[0].name = TWELVE;
    expect(loadWorld(JSON.stringify(save)).getSnapshot().cats[0]!.name).toBe(
      TWELVE,
    );
  });

  it('the chat speaks of the new name; replies already saved stay as they were', async () => {
    const session = createTestSession();
    expect((await session.talk('mochi', '你好')).ok).toBe(true);
    expect(
      session.execute({ type: 'RENAME_CAT', catId: 'mochi', name: '团子' }).ok,
    ).toBe(true);
    expect((await session.talk('mochi', '你好')).ok).toBe(true);
    const [before, after] = session.getSnapshot().cats[0]!.memories;
    expect(before!.reply).toContain('我是 Mochi');
    expect(after!.reply).toContain('我是 团子');
  });
});
