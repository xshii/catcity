import { describe, expect, it } from 'vitest';
import { MAX_COMPANIONS } from '../../src/content/cats';
import { BOND_LEVELS } from '../../src/content/care';
import {
  BREED_BOND_LEVEL,
  BREED_COOLDOWN_MINUTES,
  KITTEN_MINUTES,
} from '../../src/content/family';
import { MOOD } from '../../src/content/mood';
import type { CatEntity, WorldState } from '../../src/core';
import { breedBlocks, related, type BreedBlock } from '../../src/core/family';
import { readyPair } from '../helpers/family';

// Pure rules over instances built here: no cat is born yet (T-22), so the worlds below
// are not validated saves. Late enough in the game for a cooldown to have run out.
const ready: WorldState = {
  ...readyPair().getSnapshot(),
  minute: 10 * 1440,
};
const [mochi, pepper] = ready.cats as [CatEntity, CatEntity];
const trust = BOND_LEVELS[BREED_BOND_LEVEL].bond;

/** The world with one cat changed. */
const change = (
  id: string,
  fields: Partial<CatEntity>,
  world = ready,
): WorldState => ({
  ...world,
  cats: world.cats.map((cat) => (cat.id === id ? { ...cat, ...fields } : cat)),
});
const withPepper = (fields: Partial<CatEntity>) => change(pepper.id, fields);
/** Mochi, Pepper and copies of Mochi up to `count` cats. */
const withCats = (count: number): WorldState => ({
  ...ready,
  cats: [
    ...ready.cats,
    ...Array.from({ length: count - ready.cats.length }, (_, index) => ({
      ...mochi,
      id: `cat-${100 + index}`,
    })),
  ],
});
const blocks = (world: WorldState) => breedBlocks(world, mochi.id, pepper.id);

describe('breedBlocks (spec 041 R-31)', () => {
  it('lets a happy, trusting, unrelated pair with a free bed have a kitten', () => {
    expect(readyPair().getSnapshot().cats).toHaveLength(2);
    expect(blocks(ready)).toEqual([]);
    expect(breedBlocks(ready, pepper.id, mochi.id)).toEqual([]);
  });

  it.each<[BreedBlock, WorldState]>([
    ['NEED_PAIR', withPepper({ sex: 'F' })],
    ['KITTEN', withPepper({ bornMinute: ready.minute - KITTEN_MINUTES + 1 })],
    ['NEUTERED', withPepper({ neutered: true })],
    ['NOT_HAPPY', withPepper({ mood: MOOD.happy - 1 })],
    ['BOND_TOO_LOW', withPepper({ playerBond: trust - 1 })],
    ['RELATED', withPepper({ parents: { mother: mochi.id, father: 'cat-9' } })],
    [
      'COOLING_DOWN',
      withPepper({
        lastBredMinute: ready.minute - BREED_COOLDOWN_MINUTES + 1,
      }),
    ],
    ['NO_BED', { ...ready, buildings: [] }],
    ['COMPANION_LIMIT', withCats(MAX_COMPANIONS)],
  ])('reports %s alone when only that condition fails', (block, world) => {
    expect(blocks(world)).toEqual([block]);
  });

  it('reports a cat paired with itself as that alone', () => {
    expect(breedBlocks(ready, mochi.id, mochi.id)).toEqual(['SAME_CAT']);
  });

  it('holds each condition right up to its line', () => {
    expect(
      blocks(withPepper({ bornMinute: ready.minute - KITTEN_MINUTES })),
    ).toEqual([]);
    expect(
      blocks(
        withPepper({ lastBredMinute: ready.minute - BREED_COOLDOWN_MINUTES }),
      ),
    ).toEqual([]);
    expect(blocks(withCats(MAX_COMPANIONS - 1))).toEqual([]);
  });

  it('counts the beds nobody sleeps in', () => {
    const apartment = ready.buildings[0]!.id;
    const oneFree = change(mochi.id, { home: apartment });
    expect(blocks(oneFree)).toEqual([]);
    expect(blocks(change(pepper.id, { home: apartment }, oneFree))).toEqual([
      'NO_BED',
    ]);
  });

  it('reports every condition that fails, each once, in one order', () => {
    const world = change(
      mochi.id,
      { neutered: true, mood: 0 },
      { ...withPepper({ sex: 'F', mood: 0, playerBond: 0 }), buildings: [] },
    );
    expect(blocks(world)).toEqual([
      'NEED_PAIR',
      'NEUTERED',
      'NOT_HAPPY',
      'BOND_TOO_LOW',
      'NO_BED',
    ]);
    expect(breedBlocks(world, pepper.id, mochi.id)).toEqual(blocks(world));
  });
});

describe('related (spec 041 R-31)', () => {
  const cat = (id: string, parents: CatEntity['parents'] = null) => ({
    ...mochi,
    id,
    parents,
  });
  const mother = cat('cat-1');
  const father = cat('cat-2');
  const kitten = cat('cat-3', { mother: mother.id, father: father.id });
  const sister = cat('cat-4', { mother: mother.id, father: father.id });

  it('counts parent and child, either way round', () => {
    expect(related(mother, kitten)).toBe(true);
    expect(related(kitten, father)).toBe(true);
  });

  it('counts siblings, and half-siblings on either side', () => {
    expect(related(kitten, sister)).toBe(true);
    expect(
      related(kitten, cat('cat-5', { mother: mother.id, father: 'cat-9' })),
    ).toBe(true);
    expect(
      related(kitten, cat('cat-6', { mother: 'cat-8', father: father.id })),
    ).toBe(true);
  });

  it('does not count cousins or first-generation strangers', () => {
    const cousin = cat('cat-10', { mother: kitten.id, father: 'cat-7' });
    const otherCousin = cat('cat-11', { mother: sister.id, father: 'cat-8' });
    expect(related(cousin, otherCousin)).toBe(false);
    expect(related(mother, father)).toBe(false);
  });
});
