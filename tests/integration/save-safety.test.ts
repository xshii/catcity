import { describe, expect, it, vi } from 'vitest';
import { createWorld, loadWorld } from '../../src/core';
import { CAT_BREED_IDS } from '../../src/content/breeds';
import { CAT_DEFINITIONS } from '../../src/content/cats';
import { CITY_START } from '../../src/content/city';
import { MAX_TALENT, NO_TALENT, TALENT_NAMES } from '../../src/content/family';
import { BOND_LEVELS } from '../../src/content/care';
import type { CatEntity } from '../../src/core';
import { PEPPER_ID, withKitten } from '../helpers/family';
import { fishById } from '../../src/content/fishing';
import { createTestSession, memoryRepository } from '../helpers/session';
import { holdTicks } from '../unit/fishing-fixture';
import { invite } from '../helpers/world';

it('offers a reset only for a rejected save, not after a failed write', () => {
  const rejected = createTestSession({
    repository: { read: () => 'broken', write: vi.fn() },
  });
  expect(rejected.storageError).not.toBeNull();
  expect(rejected.saveRejected).toBe(true);
  const quota = createTestSession({
    repository: {
      read: () => null,
      write: () => {
        throw new Error('quota');
      },
    },
  });
  expect(quota.save()).toBe(false);
  expect(quota.storageError).not.toBeNull();
  expect(quota.saveRejected).toBe(false);
});

it('stops writing once another tab updates the save, without offering a reset', () => {
  const repository = memoryRepository();
  const write = vi.spyOn(repository, 'write');
  const session = createTestSession({ repository });
  session.externalSaveChanged();
  expect(session.storageError).toContain('另一个');
  expect(session.saveRejected).toBe(false);
  write.mockClear();
  expect(session.execute({ type: 'ADVANCE_TIME', minutes: 5 }).ok).toBe(true);
  expect(session.save()).toBe(false);
  expect(write).not.toHaveBeenCalled();
});

it('rejects an in-progress run whose encounter differs from its seed and inputs', () => {
  const world = createWorld(42);
  world.dispatch({
    type: 'FISH_BEGIN',
    catId: 'mochi',
    spotId: 'POND',
    baitId: 'BREAD',
    direction: 30,
    aimDepth: 50,
  });
  const runId = world.getSnapshot().fishing.active!.id;
  holdTicks(world, runId, true, 23);
  holdTicks(world, runId, false, 1);
  const run = world.getSnapshot().fishing.active!;
  expect(run.phase).toBe('waiting');
  expect(run.speciesId).toBe('CRUCIAN');
  const silver = fishById('SILVER');
  for (const changes of [
    // Another fish of the same pond with a size valid for that species.
    {
      speciesId: 'SILVER',
      weight: silver.minWeight,
      lengthMm: silver.minLengthMm,
    },
    { weight: run.weight === 600 ? 599 : run.weight + 1 },
    { precision: !run.precision },
  ]) {
    const save = JSON.parse(world.save());
    Object.assign(save.world.fishing.active, changes);
    expect(() => loadWorld(JSON.stringify(save))).toThrow();
  }
});

it('rejects cats that no longer match their template or duplicate a unique resident', () => {
  const world = createWorld(42);
  invite(world);
  const base = world.save();
  expect(() => loadWorld(base)).not.toThrow();
  for (const forge of [
    (cats: { breedId: string }[]) => (cats[1]!.breedId = 'RAGDOLL'),
    (cats: { favoriteFish: string[] }[]) =>
      (cats[0]!.favoriteFish = ['KOI', 'MOON_CARP']),
    (cats: { sex: string }[]) => (cats[1]!.sex = 'F'),
  ]) {
    const save = JSON.parse(base);
    forge(save.world.cats);
    expect(() => loadWorld(JSON.stringify(save))).toThrow();
  }
  const twoPeppers = JSON.parse(base);
  const pepper = twoPeppers.world.cats[1];
  twoPeppers.world.cats.push({
    ...pepper,
    id: `cat-${twoPeppers.world.nextId}`,
    position: { x: 3, y: 3 },
  });
  twoPeppers.world.nextId++;
  expect(() => loadWorld(JSON.stringify(twoPeppers))).toThrow();
  // Names stay free text within 12 characters (R-16): the UI renders them literally.
  const renamed = JSON.parse(base);
  renamed.world.cats[0].name = '<b>你好</b>';
  expect(() => loadWorld(JSON.stringify(renamed))).not.toThrow();
});

describe('a cat carries its own identity (spec 041 R-10, R-11)', () => {
  const twoCats = () => {
    const world = createWorld(42);
    invite(world);
    return world;
  };
  it('saves the identity of each cat and restores it exactly', () => {
    const world = twoCats();
    const saved = world.save();
    const [mochi, pepper] = JSON.parse(saved).world.cats;
    // Every cat so far is of the first generation: an adult without parents or talent.
    const firstGeneration = {
      bornMinute: null,
      generation: 1,
      parents: null,
      neutered: false,
      talent: NO_TALENT,
      heritage: 0,
      lastBredMinute: null,
    };
    expect(mochi).toMatchObject({
      definitionId: 'MOCHI',
      sex: 'F',
      ...firstGeneration,
    });
    expect(pepper).toMatchObject({
      definitionId: 'PEPPER',
      sex: 'M',
      ...firstGeneration,
    });
    const restored = loadWorld(saved);
    expect(restored.save()).toBe(saved);
    expect(restored.getSnapshot()).toEqual(world.getSnapshot());
  });

  it.each([
    [
      'a first-generation cat of generation 2',
      0,
      { generation: 2 },
      /template/,
    ],
    [
      'a first-generation cat with parents',
      0,
      { parents: { mother: 'mochi', father: 'cat-1' } },
      /template/,
    ],
    [
      'a first-generation cat with a birth minute',
      0,
      { bornMinute: CITY_START.minute },
      /template/,
    ],
    [
      'a first-generation cat with talent',
      0,
      { talent: { ...NO_TALENT, feel: 1 } },
      /template/,
    ],
    [
      'a first-generation cat with family marks',
      0,
      { heritage: 1 },
      /template/,
    ],
    ['Mochi as a tom', 0, { sex: 'M' }, /template/],
    ['Pepper as a queen', 1, { sex: 'F' }, /template/],
    // A cat without a template is one born in the city: it needs its parents (T-22).
    [
      'a cat without a template or parents',
      1,
      { definitionId: null },
      /parents/,
    ],
    ['an unknown sex', 0, { sex: 'X' }, /sex/],
    ['generation 0', 0, { generation: 0 }, /generation/],
    [
      'a talent past the limit',
      0,
      { talent: { ...NO_TALENT, stamina: MAX_TALENT + 1 } },
      /talent/,
    ],
    ['neutering that is not yes or no', 0, { neutered: 'yes' }, /neutered/],
    ['parents without a father', 0, { parents: { mother: 'mochi' } }, /father/],
  ])('rejects %s', (_, index, change, reason) => {
    const save = JSON.parse(twoCats().save());
    const cat = save.world.cats[index];
    for (const field of Object.keys(change)) expect(cat).toHaveProperty(field);
    Object.assign(cat, change);
    expect(() => loadWorld(JSON.stringify(save))).toThrow(reason);
  });

  it('rejects breeding yet to come', () => {
    const save = JSON.parse(twoCats().save());
    expect(save.world.cats[0].lastBredMinute).toBeNull();
    save.world.cats[0].lastBredMinute = save.world.minute + 1;
    expect(() => loadWorld(JSON.stringify(save))).toThrow(/breeding/);
  });

  it.each([
    'sex',
    'bornMinute',
    'generation',
    'parents',
    'neutered',
    'talent',
    'heritage',
    'lastBredMinute',
  ])('rejects a cat without %s', (field) => {
    const save = JSON.parse(twoCats().save());
    expect(save.world.cats[0]).toHaveProperty(field);
    delete save.world.cats[0][field];
    expect(() => loadWorld(JSON.stringify(save))).toThrow(field);
  });
});

type SavedCat = { breedId: string; appearance: Record<string, string> };
describe('a cat wears five choices; Mochi is the stray the player picked (spec 041 T-14)', () => {
  const twoCats = () => {
    const world = createWorld(42);
    invite(world);
    return world.save();
  };
  const edited = (edit: (cats: SavedCat[]) => void) => {
    const save = JSON.parse(twoCats());
    edit(save.world.cats);
    return JSON.stringify(save);
  };
  const BROWN_TABBY = {
    colour: 'brown',
    pattern: 'tabby',
    white: 'mittens',
    eyes: 'green',
    face: 'long',
  };

  it('saves each cat’s five choices and restores them exactly', () => {
    const saved = twoCats();
    expect(
      JSON.parse(saved).world.cats.map((cat: SavedCat) => cat.appearance),
    ).toEqual([
      CAT_DEFINITIONS.MOCHI.appearance,
      CAT_DEFINITIONS.PEPPER.appearance,
    ]);
    expect(loadWorld(saved).save()).toBe(saved);
  });

  it('takes any look of the five on any cat, its template’s or not', () => {
    for (const index of [0, 1]) {
      const save = edited((cats) => (cats[index]!.appearance = BROWN_TABBY));
      expect(loadWorld(save).getSnapshot().cats[index]!.appearance).toEqual(
        BROWN_TABBY,
      );
    }
  });

  it.each([
    ['colour', 'calico'],
    ['pattern', 'spotted'],
    ['white', 'socks'],
    ['eyes', 'red'],
    ['face', 'square'],
    ['colour', ''],
  ])('rejects %s "%s", not one of its options', (item, value) => {
    const save = edited((cats) => (cats[1]!.appearance[item] = value));
    expect(() => loadWorld(save)).toThrow(item);
  });

  it('rejects a look that lacks a choice or still wears a coat', () => {
    expect(() =>
      loadWorld(edited((cats) => delete cats[1]!.appearance.eyes)),
    ).toThrow(/eyes/);
    expect(() =>
      loadWorld(edited((cats) => (cats[1]!.appearance.coat = 'gray'))),
    ).toThrow(/coat/);
    expect(() =>
      loadWorld(edited((cats) => (cats[1]!.appearance = { coat: 'gray' }))),
    ).toThrow();
  });

  it.each(CAT_BREED_IDS)('lets Mochi, the stray, be a %s', (breed) => {
    const save = edited((cats) => (cats[0]!.breedId = breed));
    expect(loadWorld(save).getSnapshot().cats[0]!.breedId).toBe(breed);
    expect(() =>
      loadWorld(edited((cats) => (cats[0]!.breedId = 'SPHYNX'))),
    ).toThrow(/breedId/);
  });

  it('keeps every other first-generation cat to its template’s breed, a copy of Mochi too', () => {
    expect(() =>
      loadWorld(edited((cats) => (cats[1]!.breedId = 'DOMESTIC'))),
    ).toThrow(/template/);
    const world = createWorld(42);
    const copy = world.dispatch({
      type: 'DEBUG_SPAWN_CAT',
      position: { x: 2, y: 7 },
    });
    expect(copy.ok).toBe(true);
    const save = JSON.parse(world.save());
    expect(save.world.cats[1].definitionId).toBe('MOCHI');
    save.world.cats[1].breedId = 'DOMESTIC';
    expect(() => loadWorld(JSON.stringify(save))).toThrow(/template/);
  });
});

describe('a cat born in the city answers to its parents (spec 041 R-11, T-22)', () => {
  /** Mochi, Pepper and their kitten, as a save. */
  const born = () => JSON.parse(withKitten().save());
  const kittenOf = (save: { world: { cats: Record<string, unknown>[] } }) =>
    save.world.cats[2]!;

  it('saves the kitten and restores it exactly', () => {
    const saved = withKitten().save();
    expect(kittenOf(JSON.parse(saved))).toMatchObject({
      definitionId: null,
      generation: 2,
      parents: { mother: 'mochi', father: PEPPER_ID },
    });
    expect(loadWorld(saved).save()).toBe(saved);
  });

  it('takes the kitten restyled, and its parents too: a look is anyone’s (T-15)', () => {
    const save = born();
    for (const cat of save.world.cats)
      cat.appearance = {
        colour: 'brown',
        pattern: 'tabby',
        white: 'cow',
        eyes: 'green',
        face: 'long',
      };
    expect(() => loadWorld(JSON.stringify(save))).not.toThrow();
  });

  /** The other of two choices. */
  const other = <T>(value: T, [a, b]: [T, T]) => (value === a ? b : a);
  it.each<[string, (kitten: CatEntity, parents: CatEntity[]) => void, RegExp]>([
    [
      'the other parent’s breed',
      (kitten, [mother, father]) =>
        (kitten.breedId = other(kitten.breedId, [
          mother!.breedId,
          father!.breedId,
        ])),
      /inheritance/,
    ],
    [
      'a breed of neither',
      (kitten) => (kitten.breedId = 'DOMESTIC'),
      /inheritance/,
    ],
    [
      'another personality',
      (kitten) => (kitten.personality = ['brave']),
      /inheritance/,
    ],
    ['another trait', (kitten) => (kitten.traits = ['calm']), /inheritance/],
    [
      'another like',
      (kitten) => (kitten.preferences.likes = ['boxes']),
      /inheritance/,
    ],
    [
      'another dislike',
      (kitten) => (kitten.preferences.dislikes = ['rain']),
      /inheritance/,
    ],
    [
      'another favourite fish',
      (kitten) => (kitten.favoriteFish = ['KOI']),
      /inheritance/,
    ],
    ...TALENT_NAMES.map(
      (name) =>
        [
          `more ${name}`,
          (kitten: CatEntity) => kitten.talent[name]++,
          /inheritance/,
        ] as [string, (kitten: CatEntity) => void, RegExp],
    ),
    [
      'family marks its parents never earned',
      (kitten) => kitten.heritage++,
      /marks/,
    ],
    ['a template', (kitten) => (kitten.definitionId = 'MOCHI'), /template/],
    ['another generation', (kitten) => kitten.generation++, /parents/],
    [
      'its parents the wrong way round',
      (kitten) => (kitten.parents = { mother: PEPPER_ID, father: 'mochi' }),
      /parents/,
    ],
    [
      'a parent not in the city',
      (kitten) => (kitten.parents = { mother: 'mochi', father: 'cat-99' }),
      /parents/,
    ],
    ['no parents', (kitten) => (kitten.parents = null), /parents/],
    ['no birth', (kitten) => (kitten.bornMinute = null), /parents/],
  ])('rejects a kitten with %s', (_, tamper, reason) => {
    const save = born();
    const [mother, father, kitten] = save.world.cats as CatEntity[];
    tamper(kitten!, [mother!, father!]);
    expect(() => loadWorld(JSON.stringify(save))).toThrow(reason);
  });

  it('takes a kitten of either sex: the player chose it (user 2026-09-30)', () => {
    const save = born();
    kittenOf(save).sex = kittenOf(save).sex === 'F' ? 'M' : 'F';
    expect(() => loadWorld(JSON.stringify(save))).not.toThrow();
  });

  it('rejects a kitten born later than now', () => {
    const save = born();
    kittenOf(save).bornMinute = save.world.minute + 1;
    expect(() => loadWorld(JSON.stringify(save))).toThrow();
  });

  it('keeps the marks a kitten was born with when its parents earn more', () => {
    const save = born();
    for (const parent of save.world.cats.slice(0, 2))
      parent.playerBond = BOND_LEVELS.at(-1)!.bond;
    expect(() => loadWorld(JSON.stringify(save))).not.toThrow();
  });
});
