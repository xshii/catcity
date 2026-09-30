import { describe, expect, it } from 'vitest';
import { BOND_LEVELS } from '../../src/content/care';
import { CAT_START, MAX_COMPANIONS } from '../../src/content/cats';
import {
  HERITAGE_BOND_LEVELS,
  KITTEN_MINUTES,
  TALENT_NAMES,
  type Talent,
} from '../../src/content/family';
import { MOOD } from '../../src/content/mood';
import { gridDistance } from '../../src/core/city/map';
import { isWalkable } from '../../src/core/city/path';
import {
  loadWorld,
  World,
  type CatEntity,
  type WorldState,
} from '../../src/core';
import { familyMarks, inherit } from '../../src/core/inheritance';
import { later, PEPPER_ID, readyPair, withKitten } from '../helpers/family';
import { buildApartment, invite } from '../helpers/world';

// Spec 041 R-32 – R-35 (design 5.2 – 5.4): a kitten of a ready pair, its sex the
// player's (user 2026-09-30), the rest of its identity drawn from the seed and its id
// alone, each trait from one of its parents.

const breed = (
  world: World,
  name = '团子',
  motherId = 'mochi',
  fatherId = PEPPER_ID,
  sex: 'F' | 'M' = 'F',
) => world.dispatch({ type: 'BREED_CATS', motherId, fatherId, name, sex });
/** The world with `change` made to its state: a save as play could have left it. */
const edited = (world: World, change: (state: WorldState) => void): World => {
  const state = world.getSnapshot();
  change(state);
  return new World(state);
};
/** The identity a kitten takes from its parents: everything `inherit` decides. */
const identity = (cat: CatEntity) => ({
  breedId: cat.breedId,
  appearance: cat.appearance,
  personality: cat.personality,
  traits: cat.traits,
  likes: cat.preferences.likes,
  dislikes: cat.preferences.dislikes,
  favoriteFish: cat.favoriteFish,
  talent: cat.talent,
});
const talentSum = (talent: Talent) =>
  TALENT_NAMES.reduce((sum, name) => sum + talent[name], 0);

describe('BREED_CATS (spec 041 R-32, design 5.2)', () => {
  it('gives the pair a kitten of the next id, in the free bed, beside its home', () => {
    const world = readyPair();
    const before = world.getSnapshot();
    const [mochi, pepper] = before.cats as [CatEntity, CatEntity];
    const id = `cat-${before.nextId}`;
    expect(breed(world)).toEqual({
      ok: true,
      events: [
        {
          type: 'CatBorn',
          minute: before.minute,
          entityId: id,
          motherId: mochi.id,
          fatherId: pepper.id,
        },
      ],
    });
    const after = world.getSnapshot();
    expect(after.nextId).toBe(before.nextId + 1);
    expect(after.coins).toBe(before.coins);
    const kitten = after.cats.at(-1)!;
    const home = before.buildings[0]!;
    expect(kitten).toMatchObject({
      id,
      definitionId: null,
      name: '团子',
      sex: 'F',
      bornMinute: before.minute,
      generation: 2,
      parents: { mother: mochi.id, father: pepper.id },
      neutered: false,
      heritage: 0,
      lastBredMinute: null,
      mood: CAT_START.mood,
      needs: CAT_START.needs,
      playerBond: 0,
      home: home.id,
      memories: [],
      fishingSpotId: null,
      walk: null,
    });
    expect(identity(kitten)).toEqual(
      inherit(before.seed, id, mochi, pepper, 0),
    );
    // The walkable tile nearest its home, ties by row then column, as a newcomer's.
    const nearest = before.map.tiles
      .map((tile) => tile.position)
      .filter((position) => isWalkable(before, position))
      .sort(
        (a, b) =>
          gridDistance(a, home.position) - gridDistance(b, home.position) ||
          a.y - b.y ||
          a.x - b.x,
      )[0];
    expect(kitten.position).toEqual(nearest);
    // Both parents rest from now; nothing else about them changes.
    expect(after.cats.slice(0, 2)).toEqual(
      before.cats.map((cat) => ({ ...cat, lastBredMinute: before.minute })),
    );
  });

  it.each(['F', 'M'] as const)(
    'gives the kitten the sex the player chose: %s',
    (sex) => {
      const world = readyPair();
      expect(breed(world, '团子', 'mochi', PEPPER_ID, sex).ok).toBe(true);
      const kitten = world.getSnapshot().cats.at(-1)!;
      expect(kitten.sex).toBe(sex);
      // The rest of it is the seed's either way.
      const other = readyPair();
      breed(other, '团子', 'mochi', PEPPER_ID, sex === 'F' ? 'M' : 'F');
      expect(identity(other.getSnapshot().cats.at(-1)!)).toEqual(
        identity(kitten),
      );
    },
  );

  it.each([
    ['no sex', {}],
    ['an unknown sex', { sex: 'X' }],
    ['a sex in words', { sex: '母' }],
  ])('rejects %s, and changes nothing', (_, sex) => {
    const world = readyPair();
    const before = world.save();
    expect(
      world.dispatch({
        type: 'BREED_CATS',
        motherId: 'mochi',
        fatherId: PEPPER_ID,
        name: '团子',
        ...sex,
      }),
    ).toEqual({ ok: false, error: 'INVALID_COMMAND' });
    expect(world.save()).toBe(before);
  });

  it('saves the kitten and restores it exactly', () => {
    const world = withKitten();
    const saved = world.save();
    const restored = loadWorld(saved);
    expect(restored.save()).toBe(saved);
    expect(restored.getSnapshot()).toEqual(world.getSnapshot());
  });

  const rejects = (world: World, error: string, ...args: string[]) => {
    const before = world.save();
    expect(breed(world, ...args)).toEqual({ ok: false, error });
    expect(world.save()).toBe(before);
  };

  it.each<[string, string, (world: World) => World]>([
    [
      'CAT_NEUTERED',
      'a neutered mother',
      (world) => edited(world, (state) => (state.cats[0]!.neutered = true)),
    ],
    [
      'NOT_HAPPY',
      'a father just short of happy',
      (world) =>
        edited(world, (state) => (state.cats[1]!.mood = MOOD.happy - 1)),
    ],
    [
      'BOND_TOO_LOW',
      'a mother just short of 信任',
      (world) =>
        edited(
          world,
          (state) => (state.cats[0]!.playerBond = BOND_LEVELS[2].bond - 1),
        ),
    ],
    [
      'NO_BED',
      'no bed',
      (world) => edited(world, (state) => (state.buildings = [])),
    ],
    [
      'COMPANION_LIMIT',
      'the companions at their limit',
      (world) => {
        // Copies of Mochi on the first free grass, row by row.
        const state = world.getSnapshot();
        const grass = state.map.tiles
          .map((tile) => tile.position)
          .filter((position) => isWalkable(state, position))
          .slice(0, MAX_COMPANIONS - state.cats.length);
        for (const position of grass)
          expect(world.dispatch({ type: 'DEBUG_SPAWN_CAT', position }).ok).toBe(
            true,
          );
        return world;
      },
    ],
  ])('rejects with %s for %s, and changes nothing', (error, _, make) => {
    rejects(make(readyPair()), error);
  });

  it('rejects the same cat twice, a pair of one sex, and parents the wrong way round', () => {
    const world = readyPair();
    rejects(world, 'SAME_CAT', '团子', 'mochi', 'mochi');
    rejects(world, 'NEED_PAIR', '团子', PEPPER_ID, 'mochi');
    const copy = world.dispatch({
      type: 'DEBUG_SPAWN_CAT',
      position: { x: 3, y: 7 },
    });
    expect(copy.ok).toBe(true);
    rejects(world, 'NEED_PAIR', '团子', 'mochi', 'cat-3');
    rejects(world, 'CAT_NOT_FOUND', '团子', 'mochi', 'cat-99');
  });

  it('rejects a kitten, a cat resting after its kitten and a cat of the family', () => {
    // withKitten's kitten is a queen: with her father she is a pair of the other sex.
    const world = withKitten();
    const kitten = world.getSnapshot().cats[2]!;
    const [mother, father] = [kitten.id, PEPPER_ID];
    rejects(world, 'CAT_TOO_YOUNG', '团子', mother, father);
    // The parents again, a minute later and happy as ever: they rest.
    rejects(later(world, 1, ['mochi', PEPPER_ID]), 'COOLING_DOWN');
    // The kitten grown up, happy and trusting: still its parent's child.
    rejects(
      later(world, KITTEN_MINUTES, [kitten.id, 'mochi', PEPPER_ID]),
      'RELATED',
      '团子',
      mother,
      father,
    );
  });

  it.each(['', ' 团子', '一二三四五六七八九十一二三', '团\n子'])(
    'rejects the name "%s" (R-16)',
    (name) => rejects(readyPair(), 'INVALID_COMMAND', name),
  );

  it('uses no id, draw or anything else until a kitten is born', () => {
    const world = readyPair();
    const before = world.save();
    expect(
      world.check({
        type: 'BREED_CATS',
        motherId: 'mochi',
        fatherId: PEPPER_ID,
        name: '团子',
        sex: 'M',
      }),
    ).toEqual({ ok: true });
    expect(world.save()).toBe(before);
  });
});

describe('inherit (spec 041 R-33, R-35, design 5.3 – 5.4)', () => {
  const pair = readyPair().getSnapshot();
  /** Parents unlike each other in every trait, so each draw shows whose it took. */
  const mother: CatEntity = {
    ...pair.cats[0]!,
    talent: { feel: 1, stamina: 3, affection: 0 },
  };
  const father: CatEntity = {
    ...pair.cats[1]!,
    appearance: {
      colour: 'black',
      pattern: 'tabby',
      white: 'mittens',
      eyes: 'green',
      face: 'long',
    },
    talent: { feel: 2, stamina: 0, affection: 4 },
  };
  const SEEDS = 1000;
  const kittens = Array.from({ length: SEEDS }, (_, seed) =>
    inherit(seed, 'cat-3', mother, father, 0),
  );
  /** One of each parent's list, the mother's first, without repeats. */
  const oneOfEach = (
    child: readonly string[],
    a: readonly string[],
    b: readonly string[],
  ) =>
    child.length >= 1 &&
    child.length <= 2 &&
    a.includes(child[0]!) &&
    (child.length === 1 ? b.includes(child[0]!) : b.includes(child[1]!));

  it('is the same for the same seed, kitten and parents, whatever else they do', () => {
    const again = inherit(
      7,
      'cat-3',
      { ...mother, mood: 0, name: '别的' },
      {
        ...father,
        playerBond: 999,
        position: { x: 0, y: 0 },
      },
      0,
    );
    expect(again).toEqual(inherit(7, 'cat-3', mother, father, 0));
    expect(inherit(7, 'cat-4', mother, father, 0)).not.toEqual(again);
  });

  it(`takes every trait from one of the parents, over ${SEEDS} seeds`, () => {
    for (const kitten of kittens) {
      expect([mother.breedId, father.breedId]).toContain(kitten.breedId);
      for (const item of Object.keys(
        kitten.appearance,
      ) as (keyof CatEntity['appearance'])[])
        expect([mother.appearance[item], father.appearance[item]]).toContain(
          kitten.appearance[item],
        );
      expect(
        oneOfEach(kitten.personality, mother.personality, father.personality),
      ).toBe(true);
      expect(
        oneOfEach(
          kitten.favoriteFish,
          mother.favoriteFish,
          father.favoriteFish,
        ),
      ).toBe(true);
      expect(oneOfEach(kitten.traits, mother.traits, father.traits)).toBe(true);
      expect(
        oneOfEach(
          kitten.likes,
          mother.preferences.likes,
          father.preferences.likes,
        ),
      ).toBe(true);
      expect(
        oneOfEach(
          kitten.dislikes,
          mother.preferences.dislikes,
          father.preferences.dislikes,
        ),
      ).toBe(true);
      for (const name of TALENT_NAMES)
        expect([mother.talent[name], father.talent[name]]).toContain(
          kitten.talent[name],
        );
    }
  });

  it('takes each trait from either parent about as often', () => {
    /** How many kittens took the mother's, for a trait that tells them apart. */
    const mothers = (
      take: (kitten: (typeof kittens)[number]) => unknown,
      of: unknown,
    ) => kittens.filter((kitten) => take(kitten) === of).length;
    const shares = [
      mothers((kitten) => kitten.breedId, mother.breedId),
      ...(['colour', 'pattern', 'white', 'eyes', 'face'] as const).map((item) =>
        mothers((kitten) => kitten.appearance[item], mother.appearance[item]),
      ),
      ...TALENT_NAMES.map((name) =>
        mothers((kitten) => kitten.talent[name], mother.talent[name]),
      ),
    ];
    for (const share of shares) {
      expect(share).toBeGreaterThan(SEEDS * 0.4);
      expect(share).toBeLessThan(SEEDS * 0.6);
    }
  });

  it('raises one talent per family mark passed down, each at most once, never past 4', () => {
    const even = (level: number): Talent => ({
      feel: level,
      stamina: level,
      affection: level,
    });
    const at = (level: number, passed: number, seed = 3) =>
      inherit(
        seed,
        'cat-3',
        { ...mother, talent: even(level) },
        { ...father, talent: even(level) },
        passed,
      ).talent;
    for (
      let passed = 0;
      passed <= 2 * HERITAGE_BOND_LEVELS.length * 2;
      passed++
    )
      for (let seed = 0; seed < 20; seed++) {
        const talent = at(1, passed, seed);
        expect(talentSum(talent)).toBe(3 + Math.min(passed, 3));
        for (const name of TALENT_NAMES)
          expect(talent[name]).toBeLessThanOrEqual(2);
      }
    expect(at(4, 3)).toEqual(even(4));
    expect(at(3, 4)).toEqual(even(4));
  });
});

describe('family marks (家传, design 5.4)', () => {
  const bond = (level: number) => BOND_LEVELS[level]!.bond;

  it.each([
    [bond(2), 0],
    [bond(3) - 1, 0],
    [bond(3), 1],
    [bond(4) - 1, 1],
    [bond(4), 2],
  ])('a cat of %i bond points has %i marks', (points, marks) => {
    const mochi = readyPair().getSnapshot().cats[0]!;
    expect(familyMarks({ ...mochi, playerBond: points })).toBe(marks);
  });

  it('passes the parents’ marks to the kitten, and its line’s to the next', () => {
    const world = edited(readyPair(), (state) => {
      state.cats[0]!.playerBond = bond(4);
      state.cats[1]!.playerBond = bond(3);
    });
    expect(breed(world).ok).toBe(true);
    const kitten = world.getSnapshot().cats[2]!;
    expect(kitten.heritage).toBe(3);
    // Each of the three raised once from nothing.
    expect(kitten.talent).toEqual({ feel: 1, stamina: 1, affection: 1 });
    // Grown up, the queen has a kitten with a tom newly come: the line's three marks,
    // her own mark (亲密) and the newcomer's two (家人).
    const rich = edited(world, (state) => (state.coins = 10_000));
    const partner = invite(rich, 'ZHIMA');
    const grown = edited(
      later(rich, KITTEN_MINUTES, [kitten.id, partner.id]),
      (state) => {
        state.cats.find((cat) => cat.id === kitten.id)!.playerBond = bond(3);
        state.cats.find((cat) => cat.id === partner.id)!.playerBond = bond(4);
      },
    );
    const [motherId, fatherId] = [kitten.id, partner.id];
    // Its parents', the partner's and its own beds are taken: one more apartment.
    buildApartment(grown);
    expect(breed(grown, '小满', motherId, fatherId).ok).toBe(true);
    const next = grown.getSnapshot().cats.at(-1)!;
    expect(next.generation).toBe(3);
    expect(next.heritage).toBe(3 + 0 + 1 + 2);
  });
});
