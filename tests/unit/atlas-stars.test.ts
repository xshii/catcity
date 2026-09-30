import { describe, expect, it } from 'vitest';
import {
  FISH,
  FISH_IDS,
  fishById,
  lengthStar,
  type FishId,
} from '../../src/content/fishing';
import type { WorldState } from '../../src/core';
import {
  atlasNote,
  atlasStars,
  SCREEN_COPY,
} from '../../src/view/fishing/screen';

type Atlas = WorldState['fishing']['atlas'];

/** An atlas with these species caught once, at these record lengths. */
const atlas = (records: Partial<Record<FishId, number>> = {}): Atlas =>
  Object.fromEntries(
    FISH_IDS.map((id) => {
      const length = records[id] ?? 0;
      return [
        id,
        {
          count: length ? 1 : 0,
          bestWeight: length ? 1 : 0,
          bestLengthMm: length,
        },
      ];
    }),
  ) as Atlas;

/** The shortest record of a species that earns this many stars. */
function shortestWith(species: FishId, stars: number) {
  const fish = fishById(species);
  for (let length = fish.minLengthMm; length <= fish.maxLengthMm; length++)
    if (lengthStar(species, length) >= stars) return length;
  throw new Error(`${species} never reaches ${stars} stars`);
}

describe('lengthStar: a species record earns bronze, silver and gold (R-54)', () => {
  it('no record has no star, and the shortest catch of a species is not a star by itself', () => {
    for (const fish of FISH) {
      expect(lengthStar(fish.id, 0)).toBe(0);
      expect(lengthStar(fish.id, fish.minLengthMm)).toBe(0);
    }
  });

  it('the longest catch of a species earns all three stars', () => {
    for (const fish of FISH)
      expect(lengthStar(fish.id, fish.maxLengthMm)).toBe(3);
  });

  it('a growing record earns the stars one by one and never loses one', () => {
    for (const fish of FISH) {
      const seen: number[] = [];
      let previous = 0;
      for (
        let length = fish.minLengthMm;
        length <= fish.maxLengthMm;
        length++
      ) {
        const stars = lengthStar(fish.id, length);
        expect(stars - previous).toBeGreaterThanOrEqual(0);
        expect(stars - previous).toBeLessThanOrEqual(1);
        if (stars !== previous) seen.push(stars);
        previous = stars;
      }
      expect(seen).toEqual([1, 2, 3]);
    }
  });
});

describe('atlasStars: what an atlas entry shows of its stars (ui-design 5.9)', () => {
  it('a fish never caught shows no stars', () => {
    for (const id of FISH_IDS) expect(atlasStars(id, atlas()[id])).toBeNull();
  });

  it('a caught fish shows bronze, silver and gold each as collected or not, and reads them in words', () => {
    const words = SCREEN_COPY.atlas;
    for (const [stars, label] of [
      [0, words.label([])],
      [1, words.label(['铜星'])],
      [2, words.label(['铜星', '银星'])],
      [3, words.label(['铜星', '银星', '金星'])],
    ] as const) {
      const length =
        stars === 0
          ? fishById('PERCH').minLengthMm
          : shortestWith('PERCH', stars);
      const shown = atlasStars('PERCH', atlas({ PERCH: length }).PERCH)!;
      expect(shown.lit).toBe(stars);
      expect(shown.marks).toEqual(
        words.names.map((name, index) => ({ name, lit: index < stars })),
      );
      expect(shown.label).toBe(label);
    }
    expect(words.label([])).not.toBe(words.label(['铜星']));
  });

  it('shows no threshold and no distance to the next star', () => {
    for (const stars of [1, 2, 3]) {
      const length = shortestWith('PERCH', stars) - 1;
      const shown = atlasStars('PERCH', atlas({ PERCH: length }).PERCH)!;
      expect(shown.label).not.toMatch(/\d|cm|再长/);
    }
  });
});

describe('atlasNote: a catch that adds a species or a star, told from two snapshots', () => {
  it('says nothing when the atlas did not change or a record grew within its star', () => {
    const bronze = shortestWith('CRUCIAN', 1);
    expect(atlasNote(atlas(), atlas())).toBe('');
    expect(
      atlasNote(atlas({ CRUCIAN: bronze }), atlas({ CRUCIAN: bronze + 1 })),
    ).toBe('');
  });

  it('names a species caught for the first time', () => {
    const length = fishById('PERCH').minLengthMm;
    expect(atlasNote(atlas(), atlas({ PERCH: length }))).toBe(
      SCREEN_COPY.atlas.newSpecies('鲈鱼', null),
    );
  });

  it('a first catch long enough for a star says both at once', () => {
    expect(atlasNote(atlas(), atlas({ PERCH: shortestWith('PERCH', 2) }))).toBe(
      SCREEN_COPY.atlas.newSpecies('鲈鱼', '银星'),
    );
  });

  it('names the highest star a longer record reached, once', () => {
    const before = atlas({ SILVER: shortestWith('SILVER', 1) });
    const silver = atlas({ SILVER: shortestWith('SILVER', 2) });
    const gold = atlas({ SILVER: shortestWith('SILVER', 3) });
    expect(atlasNote(before, silver)).toBe(
      SCREEN_COPY.atlas.reached('银鱼', '银星'),
    );
    expect(atlasNote(before, gold)).toBe(
      SCREEN_COPY.atlas.reached('银鱼', '金星'),
    );
    expect(atlasNote(gold, gold)).toBe('');
  });
});
