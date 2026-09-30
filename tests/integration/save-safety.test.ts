import { describe, expect, it, vi } from 'vitest';
import { createWorld, loadWorld } from '../../src/core';
import { CITY_START } from '../../src/content/city';
import { MAX_TALENT } from '../../src/content/family';
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
    (cats: { breedId: string }[]) => (cats[0]!.breedId = 'BRITISH_SHORTHAIR'),
    (cats: { favoriteFish: string[] }[]) =>
      (cats[0]!.favoriteFish = ['KOI', 'MOON_CARP']),
    (cats: { appearance: { coat: string } }[]) =>
      (cats[1]!.appearance.coat = 'cream'),
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
  // Names stay free text: the UI renders them literally.
  const renamed = JSON.parse(base);
  renamed.world.cats[0].name = 'Mochi <b>你好</b>';
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
      talent: 0,
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
    ['a first-generation cat with talent', 0, { talent: 1 }, /template/],
    ['Mochi as a tom', 0, { sex: 'M' }, /template/],
    ['Pepper as a queen', 1, { sex: 'F' }, /template/],
    // No command makes a cat without a template until breeding exists (T-22).
    ['a cat without a template', 1, { definitionId: null }, /definitionId/],
    ['an unknown sex', 0, { sex: 'X' }, /sex/],
    ['generation 0', 0, { generation: 0 }, /generation/],
    ['a talent past the limit', 0, { talent: MAX_TALENT + 1 }, /talent/],
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
    'lastBredMinute',
  ])('rejects a cat without %s', (field) => {
    const save = JSON.parse(twoCats().save());
    expect(save.world.cats[0]).toHaveProperty(field);
    delete save.world.cats[0][field];
    expect(() => loadWorld(JSON.stringify(save))).toThrow(field);
  });
});
