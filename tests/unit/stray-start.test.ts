import { describe, expect, it } from 'vitest';
import { CAT_BREED_IDS, CAT_BREEDS } from '../../src/content/breeds';
import { CAT_DEFINITIONS } from '../../src/content/cats';
import { canCatchFish, FISH_IDS } from '../../src/content/fishing';
import { createWorld, loadWorld } from '../../src/core/world';

// Spec 041 T-14 PR 2 (cat-looks.md 2): a new game starts with a stray whose breed and
// look the player picks, once.

const STRAY = {
  breed: 'DOMESTIC',
  appearance: {
    colour: 'brown',
    pattern: 'tabby',
    white: 'bib',
    eyes: 'green',
    face: 'pointed',
  },
} as const;

describe('the domestic cat (田园猫)', () => {
  it('is a third breed, with no fish of its own', () => {
    expect(CAT_BREED_IDS).toEqual(['DOMESTIC', 'RAGDOLL', 'BRITISH_SHORTHAIR']);
    expect(CAT_BREEDS.DOMESTIC).toEqual({
      name: '田园猫',
      fishingHint: '什么鱼都愿意陪你钓',
    });
    // Koi wait for a ragdoll and moon carp for a shorthair.
    const own = FISH_IDS.filter((id) => !canCatchFish(id, 'DOMESTIC'));
    expect(own).toEqual(['KOI', 'MOON_CARP']);
  });

  it('is no template’s breed: only the stray can be one', () => {
    expect(
      Object.values(CAT_DEFINITIONS).map((cat) => cat.breedId),
    ).not.toContain('DOMESTIC');
  });
});

describe('a new world with the stray the player picked', () => {
  it('makes Mochi that breed and look, and nothing else differs', () => {
    const plain = createWorld(42).getSnapshot();
    const picked = createWorld(42, STRAY).getSnapshot();
    expect(picked.cats[0]).toEqual({
      ...plain.cats[0],
      breedId: 'DOMESTIC',
      appearance: STRAY.appearance,
    });
    expect({ ...picked, cats: [] }).toEqual({ ...plain, cats: [] });
  });

  it('starts Mochi as its template without a pick', () => {
    const [mochi] = createWorld(42).getSnapshot().cats;
    expect(mochi!.breedId).toBe(CAT_DEFINITIONS.MOCHI.breedId);
    expect(mochi!.appearance).toEqual(CAT_DEFINITIONS.MOCHI.appearance);
  });

  it('is the same world for the same seed and pick, and saves and loads exactly', () => {
    const saved = createWorld(42, STRAY).save();
    expect(createWorld(42, STRAY).save()).toBe(saved);
    expect(loadWorld(saved).save()).toBe(saved);
  });

  it.each(CAT_BREED_IDS)('lets the stray be a %s', (breed) => {
    const world = createWorld(42, { ...STRAY, breed });
    expect(world.getSnapshot().cats[0]!.breedId).toBe(breed);
  });

  it('rejects a pick that is no breed or no look', () => {
    const bad = [
      { ...STRAY, breed: 'SPHYNX' },
      { ...STRAY, appearance: { ...STRAY.appearance, colour: 'calico' } },
    ];
    for (const stray of bad)
      expect(() => createWorld(42, stray as never)).toThrow();
  });
});
