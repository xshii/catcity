import { describe, expect, it } from 'vitest';
import { BOND } from '../../src/content/care';
import { CAT_DEFINITIONS } from '../../src/content/cats';
import { CAFE } from '../../src/content/city';
import { KITTEN_MINUTES } from '../../src/content/family';
import {
  FISH,
  skillXp,
  SPOTS,
  type FishId,
  type SpotId,
} from '../../src/content/fishing';
import { MOOD } from '../../src/content/mood';
import { PETTING } from '../../src/content/petting';
import { WISH, type WishKind } from '../../src/content/wishes';
import {
  createWorld,
  loadWorld,
  pettingTastes,
  World,
  type CatEntity,
  type CommandResult,
  type Position,
  type WorldState,
} from '../../src/core';
import { gameDay } from '../../src/core/bond';
import type { CatBreed } from '../../src/content/breeds';
import { assertWishes, wishesArise, wishTargets } from '../../src/core/wishes';
import { advance, invite } from '../helpers/world';
import { finishFishing, fishingFixture } from './fishing-fixture';

// Wishes (spec 041 R-50 – R-53, design 7): a grown companion may think of one as a game
// day starts; the player grants it by doing what it wished for, whenever that is.

const DAY = BOND.dayMinutes;
/** Owned plots of the seed 42 starter district that touch its roads. */
const PLOT = {
  a: { x: 4, y: 3 },
  b: { x: 6, y: 4 },
  /** Two tiles west of `a`, five from `far`. */
  west: { x: 3, y: 4 },
  near: { x: 4, y: 4 },
  aside: { x: 6, y: 3 },
  far: { x: 6, y: 6 },
};

const rich = (world = createWorld(42)) =>
  new World({ ...world.getSnapshot(), coins: 100_000 });
const cat = (world: World, index = 0) => world.getSnapshot().cats[index]!;
const must = (result: CommandResult) => {
  if (!result.ok) throw new Error(result.error);
  return result.events;
};
const granted = (result: CommandResult) =>
  must(result).filter((event) => event.type === 'WishFulfilled');
function build(
  world: World,
  position: Position,
  buildingType: 'CAT_APARTMENT' | 'CAT_CAFE' = 'CAT_APARTMENT',
): string {
  must(world.dispatch({ type: 'BUILD_BUILDING', buildingType, position }));
  return world.getSnapshot().buildings.at(-1)!.id;
}
const assign = (world: World, buildingId: string, catId = 'mochi') =>
  world.dispatch({ type: 'ASSIGN_HOME', catId, buildingId });
/** The world with the cat's wish set to this one, thought of today. */
function wishing(
  world: World,
  kind: WishKind,
  target: string | null = null,
  index = 0,
): World {
  const state = world.getSnapshot();
  state.cats[index]!.wish = { kind, target, sinceDay: gameDay(state.minute) };
  return new World(state);
}
function edited(world: World, change: (state: WorldState) => void): World {
  const state = world.getSnapshot();
  change(state);
  return new World(state);
}
/** Game minutes until the next game day starts. */
const untilDayStart = (world: World) =>
  DAY - (world.getSnapshot().minute % DAY);
/** The waters of a skill level and the species that open them, caught once each. */
function opened(state: WorldState, level: number, species: readonly FishId[]) {
  state.fishing.xp = skillXp(level);
  for (const id of species) {
    const fish = FISH.find((item) => item.id === id)!;
    state.fishing.atlas[id] = {
      count: 1,
      bestWeight: fish.minWeight,
      bestLengthMm: fish.minLengthMm,
    };
  }
}
const MOON_OPEN = ['SILVER', 'CRUCIAN', 'PERCH', 'MACKEREL'] as const;
/** In a raw state, what the first cat thinks of, free of any wish, as day `day` starts. */
function dayStart(state: WorldState, day: number): CatEntity['wish'] {
  state.minute = day * DAY;
  state.cats[0]!.wish = null;
  wishesArise(state);
  return state.cats[0]!.wish;
}
const fishIn = (spots: readonly SpotId[]) =>
  FISH.filter((fish) =>
    spots.some((spot) => SPOTS[spot].fish.includes(fish.id)),
  ).map((fish) => fish.id);

describe('a wish arises (R-50)', () => {
  it('only as a game day starts, for a companion without one, and then it stays', () => {
    const world = rich();
    invite(world);
    let before = world.getSnapshot().cats.map((cat) => cat.wish);
    for (let day = 1; day <= 60 && before.some((wish) => !wish); day++) {
      // Nothing all day long.
      expect(advance(world, untilDayStart(world) - 1).ok).toBe(true);
      expect(world.getSnapshot().cats.map((cat) => cat.wish)).toEqual(before);
      expect(advance(world, 1).ok).toBe(true);
      const now = world.getSnapshot().cats.map((cat) => cat.wish);
      now.forEach((wish, index) => {
        if (before[index]) expect(wish).toEqual(before[index]);
        else if (wish) expect(wish.sinceDay).toBe(day);
      });
      before = now;
    }
    expect(before.every((wish) => wish)).toBe(true);
  });

  it('as often as content says, from the seed, the cat and the day alone', () => {
    const DAYS = 4000;
    const counts = new Map<string, number>();
    let arose = 0;
    for (const [seed, catId] of [
      [42, 'mochi'],
      [7, 'cat-3'],
    ] as const) {
      const state = createWorld(seed).getSnapshot();
      state.cats[0]!.id = catId;
      for (let day = 1; day <= DAYS; day++) {
        const wish = dayStart(state, day);
        expect(dayStart(state, day)).toEqual(wish);
        if (!wish) continue;
        arose++;
        counts.set(wish.kind, (counts.get(wish.kind) ?? 0) + 1);
      }
    }
    const percent = (arose / (2 * DAYS)) * 100;
    expect(Math.abs(percent - WISH.chancePercent)).toBeLessThan(3);
    // Mochi of a new game can wish for all but a cafe, each kind about as often.
    expect([...counts.keys()].sort()).toEqual(
      ['FISH', 'HOME', 'OUTING', 'PETTING'].sort(),
    );
    for (const count of counts.values())
      expect(Math.abs(count / arose - 1 / 4)).toBeLessThan(0.04);
  });

  it('the same for one long advance and many short ones', () => {
    const one = rich();
    invite(one);
    build(one, PLOT.far, 'CAT_CAFE');
    const many = loadWorld(one.save());
    expect(advance(one, 20 * DAY).ok).toBe(true);
    for (let hour = 0; hour < 20 * 24; hour++) {
      expect(advance(many, 23).ok).toBe(true);
      expect(advance(many, 37).ok).toBe(true);
    }
    expect(many.save()).toBe(one.save());
    expect(one.getSnapshot().cats.some((cat) => cat.wish)).toBe(true);
  });

  it('never to a kitten; once grown, as to any grown cat', () => {
    const adult = createWorld(42).getSnapshot();
    const kitten = structuredClone(adult);
    kitten.cats[0]!.bornMinute = kitten.minute;
    const grownDay = Math.ceil((kitten.minute + KITTEN_MINUTES) / DAY);
    let wishes = 0;
    for (let day = 1; day <= 30; day++) {
      const grown = dayStart(adult, day);
      const young = dayStart(kitten, day);
      if (day < grownDay) expect(young).toBeNull();
      else expect(young).toEqual(grown);
      if (grown) wishes++;
    }
    expect(wishes).toBeGreaterThan(0);
    // Nor can a save give one to a cat before the day it was grown by.
    const saved = createWorld(42).getSnapshot();
    saved.minute = 5 * DAY;
    const mochi = saved.cats[0]!;
    mochi.bornMinute = 5 * DAY - KITTEN_MINUTES;
    mochi.wish = { kind: 'PETTING', target: null, sinceDay: 5 };
    expect(() => assertWishes(saved)).not.toThrow();
    mochi.wish.sinceDay = 4;
    expect(() => assertWishes(saved)).toThrow('Invalid wish');
  });

  it('never to a resident, which is no companion', () => {
    const world = rich();
    build(world, PLOT.near);
    const lodge = world.dispatch({
      type: 'BUILD_BUILDING',
      buildingType: 'CAT_LODGE',
      position: PLOT.aside,
    });
    expect(lodge.ok).toBe(true);
    expect(advance(world, 6 * DAY).ok).toBe(true);
    const { residents } = world.getSnapshot();
    expect(residents.length).toBeGreaterThan(0);
    for (const resident of residents)
      expect(Object.keys(resident).sort()).toEqual([
        'arrivedMinute',
        'home',
        'id',
      ]);
  });
});

describe('only what the player can do now (R-50, design 7)', () => {
  it('in a new game: a pond fish, a home, petting or the pond', () => {
    const world = createWorld(42);
    expect(wishTargets(world.getSnapshot(), cat(world))).toEqual({
      FISH: ['SILVER', 'CRUCIAN'],
      HOME: [null],
      CAFE: [],
      PETTING: [null],
      OUTING: ['POND'],
    });
  });

  it('a home only without one; a cafe only with a home and no cafe within range', () => {
    const world = rich();
    const home = build(world, PLOT.a);
    must(assign(world, home));
    const targets = () => wishTargets(world.getSnapshot(), cat(world));
    expect(targets()).toMatchObject({ HOME: [], CAFE: [null] });
    // Five tiles off: not near.
    build(world, PLOT.far, 'CAT_CAFE');
    expect(targets().CAFE).toEqual([null]);
    // One tile off.
    build(world, PLOT.near, 'CAT_CAFE');
    expect(targets().CAFE).toEqual([]);
    expect(CAFE.range).toBe(3);
  });

  it('a fish from open water that the cat’s breed can catch, and open water to go to', () => {
    const breeds: Record<CatBreed, FishId[]> = {
      RAGDOLL: ['KOI'],
      BRITISH_SHORTHAIR: ['MOON_CARP'],
      DOMESTIC: [],
    };
    for (const [breed, own] of Object.entries(breeds)) {
      const state = createWorld(42, {
        breed: breed as CatBreed,
        appearance: CAT_DEFINITIONS.MOCHI.appearance,
      }).getSnapshot();
      // The reeds and the coast (level 3, three species) but not the moon lake.
      opened(state, 4, ['SILVER', 'CRUCIAN', 'PERCH']);
      const coast = wishTargets(state, state.cats[0]!);
      expect(coast.OUTING).toEqual(['POND', 'REEDS', 'COAST']);
      expect(coast.FISH).toEqual(fishIn(['POND', 'REEDS', 'COAST']));
      opened(state, 5, MOON_OPEN);
      const all = wishTargets(state, state.cats[0]!);
      expect(all.OUTING).toEqual(['POND', 'REEDS', 'COAST', 'MOON']);
      expect(all.FISH).toEqual(
        FISH.filter(
          (fish) => fish.requiredBreed === null || own.includes(fish.id),
        ).map((fish) => fish.id),
      );
    }
  });

  it('every wish that arises, over many cities and days', () => {
    for (let seed = 0; seed < 40; seed++) {
      const state = createWorld(seed).getSnapshot();
      if (seed % 2) opened(state, 5, MOON_OPEN);
      for (let day = 1; day <= 30; day++) {
        const wish = dayStart(state, day);
        if (wish)
          expect(wishTargets(state, state.cats[0]!)[wish.kind]).toContain(
            wish.target,
          );
      }
    }
  });
});

describe('granted by doing what it wished for (R-53)', () => {
  /** Mochi at the pond with one fish caught there in the bag, at `mood`. */
  function withCatch(mood = 40) {
    const world = fishingFixture(42);
    must(
      world.dispatch({
        type: 'FISH_BEGIN',
        catId: 'mochi',
        spotId: 'POND',
        baitId: 'BREAD',
        direction: -30,
        aimDepth: 50,
      }),
    );
    finishFishing(world);
    return edited(world, (state) => (state.cats[0]!.mood = mood));
  }
  const gift = (world: World, catId = 'mochi') =>
    world.dispatch({
      type: 'GIFT_FISH',
      fishId: world.getSnapshot().fishing.inventory[0]!.id,
      catId,
    });

  it('a fish: the gift of that species, with its own reward and the wish’s', () => {
    const caught = withCatch();
    const species = caught.getSnapshot().fishing.inventory[0]!.speciesId;
    expect(cat(caught).favoriteFish).toContain(species);
    const world = wishing(caught, 'FISH', species);
    const bond = cat(world).playerBond;
    const events = granted(gift(world));
    expect(events).toEqual([
      {
        type: 'WishFulfilled',
        minute: world.getSnapshot().minute,
        entityId: 'mochi',
        kind: 'FISH',
        target: species,
      },
    ]);
    expect(cat(world).wish).toBeNull();
    expect(cat(world).lastWishDay).toBe(gameDay(world.getSnapshot().minute));
    expect(cat(world).playerBond).toBe(bond + BOND.favoriteGift + WISH.bond);
    expect(cat(world).mood).toBe(40 + MOOD.favoriteGift + WISH.mood);
    expect(loadWorld(world.save()).save()).toBe(world.save());
  });

  it('a fish: not by another species, nor by a gift to another cat', () => {
    const caught = withCatch();
    const species = caught.getSnapshot().fishing.inventory[0]!.speciesId;
    const other = species === 'SILVER' ? 'CRUCIAN' : 'SILVER';
    const world = wishing(caught, 'FISH', other);
    const wish = cat(world).wish;
    expect(granted(gift(world))).toEqual([]);
    expect(cat(world).wish).toEqual(wish);
    const shared = rich(wishing(withCatch(), 'FISH', species));
    const pepper = invite(shared);
    expect(granted(gift(shared, pepper.id))).toEqual([]);
    expect(cat(shared).wish).not.toBeNull();
  });

  it('a fish: even a gift past the day’s allowance', () => {
    const caught = edited(withCatch(), (state) => {
      state.cats[0]!.giftBond = {
        day: gameDay(state.minute),
        count: BOND.giftsPerDay,
      };
    });
    const species = caught.getSnapshot().fishing.inventory[0]!.speciesId;
    const world = wishing(caught, 'FISH', species);
    const bond = cat(world).playerBond;
    expect(granted(gift(world))).toHaveLength(1);
    expect(cat(world).playerBond).toBe(bond + WISH.bond);
    expect(cat(world).mood).toBe(40 + WISH.mood);
  });

  it('a home: moving in', () => {
    const world = wishing(rich(), 'HOME');
    const home = build(world, PLOT.a);
    const bond = cat(world).playerBond;
    const mood = cat(world).mood;
    expect(granted(assign(world, home))).toMatchObject([
      { entityId: 'mochi', kind: 'HOME', target: null },
    ]);
    expect(cat(world).wish).toBeNull();
    expect(cat(world).playerBond).toBe(bond + WISH.bond);
    expect(cat(world).mood).toBe(mood + WISH.mood);
  });

  it('a cafe: built or moved within range of home, or a move to a home near one', () => {
    const base = rich();
    const home = build(base, PLOT.a);
    must(assign(base, home));
    const near = wishing(base, 'CAFE');
    // Out of range grants nothing; within range, all at once.
    expect(
      granted(
        near.dispatch({
          type: 'BUILD_BUILDING',
          buildingType: 'CAT_CAFE',
          position: PLOT.far,
        }),
      ),
    ).toEqual([]);
    expect(cat(near).wish).not.toBeNull();
    expect(
      granted(
        near.dispatch({
          type: 'BUILD_BUILDING',
          buildingType: 'CAT_CAFE',
          position: PLOT.near,
        }),
      ),
    ).toMatchObject([{ kind: 'CAFE' }]);
    const moved = wishing(base, 'CAFE');
    build(moved, PLOT.far, 'CAT_CAFE');
    expect(
      granted(
        moved.dispatch({
          type: 'MOVE_BUILDING',
          buildingId: moved.getSnapshot().buildings.at(-1)!.id,
          position: PLOT.aside,
        }),
      ),
    ).toMatchObject([{ kind: 'CAFE' }]);
    // A new home beside a cafe.
    const moving = wishing(base, 'CAFE');
    build(moving, PLOT.far, 'CAT_CAFE');
    expect(granted(assign(moving, build(moving, PLOT.west)))).toEqual([]);
    expect(granted(assign(moving, build(moving, PLOT.b)))).toMatchObject([
      { kind: 'CAFE' },
    ]);
  });

  it('a cafe: one cafe grants every companion near it that wished for one', () => {
    const world = rich();
    build(world, PLOT.a);
    invite(world);
    must(assign(world, world.getSnapshot().buildings[0]!.id));
    const both = wishing(wishing(world, 'CAFE', null, 0), 'CAFE', null, 1);
    const events = granted(
      both.dispatch({
        type: 'BUILD_BUILDING',
        buildingType: 'CAT_CAFE',
        position: PLOT.near,
      }),
    );
    expect(events.map((event) => event.entityId)).toEqual(
      both.getSnapshot().cats.map((cat) => cat.id),
    );
  });

  it('petting: a good round, not a poor one', () => {
    const { favourite } = pettingTastes(42, 'mochi');
    const stroke = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        tick: index * PETTING.purr.periodTicks,
        spot: favourite,
      }));
    const world = wishing(
      edited(createWorld(42), (state) => (state.cats[0]!.mood = 40)),
      'PETTING',
    );
    expect(
      granted(
        world.dispatch({ type: 'PET_CAT', catId: 'mochi', strokes: stroke(1) }),
      ),
    ).toEqual([]);
    expect(cat(world).wish).not.toBeNull();
    const mood = cat(world).mood;
    const bond = cat(world).playerBond;
    const round = world.dispatch({
      type: 'PET_CAT',
      catId: 'mochi',
      strokes: stroke(8),
    });
    expect(granted(round)).toMatchObject([{ kind: 'PETTING' }]);
    const petted = must(round).find((event) => event.type === 'CatPetted')!;
    expect(cat(world).mood).toBe(
      mood + (petted.type === 'CatPetted' ? petted.mood : 0) + WISH.mood,
    );
    expect(cat(world).playerBond).toBe(bond + BOND.petting + WISH.bond);
  });

  it('an outing: a fish caught together at that water, the mood only up to just under happy (C3)', () => {
    const world = wishing(
      edited(fishingFixture(42), (state) => (state.cats[0]!.mood = 60)),
      'OUTING',
      'POND',
    );
    const bond = cat(world).playerBond;
    must(
      world.dispatch({
        type: 'FISH_BEGIN',
        catId: 'mochi',
        spotId: 'POND',
        baitId: 'BREAD',
        direction: -30,
        aimDepth: 50,
      }),
    );
    finishFishing(world);
    expect(cat(world).wish).toBeNull();
    expect(cat(world).playerBond).toBe(bond + BOND.catch + WISH.bond);
    expect(cat(world).mood).toBe(60 + MOOD.catch + WISH.mood);
    // From higher up, the catch and the wish stop just under the line.
    const high = wishing(
      edited(fishingFixture(42), (state) => (state.cats[0]!.mood = 70)),
      'OUTING',
      'POND',
    );
    must(
      high.dispatch({
        type: 'FISH_BEGIN',
        catId: 'mochi',
        spotId: 'POND',
        baitId: 'BREAD',
        direction: -30,
        aimDepth: 50,
      }),
    );
    finishFishing(high);
    expect(cat(high).wish).toBeNull();
    expect(cat(high).mood).toBe(MOOD.happy - 1);
  });

  it('an outing: not by a catch at another water', () => {
    const world = wishing(
      edited(fishingFixture(42), (state) =>
        opened(state, 2, ['SILVER', 'CRUCIAN']),
      ),
      'OUTING',
      'REEDS',
    );
    must(
      world.dispatch({
        type: 'FISH_BEGIN',
        catId: 'mochi',
        spotId: 'POND',
        baitId: 'BREAD',
        direction: -30,
        aimDepth: 50,
      }),
    );
    finishFishing(world);
    expect(cat(world).wish).toMatchObject({ kind: 'OUTING', target: 'REEDS' });
  });

  it('a happy cat: one more bond point and half the mood, as every source', () => {
    const world = wishing(
      edited(rich(), (state) => (state.cats[0]!.mood = MOOD.happy)),
      'HOME',
    );
    const home = build(world, PLOT.a);
    const bond = cat(world).playerBond;
    expect(granted(assign(world, home))).toHaveLength(1);
    expect(cat(world).playerBond).toBe(bond + WISH.bond + BOND.happy);
    expect(cat(world).mood).toBe(MOOD.happy + Math.floor(WISH.mood / 2));
  });
});

describe('no deadline and nothing lost (R-52, C1)', () => {
  it('a wish nobody grants stays as it was, for as long as it takes', () => {
    const world = wishing(rich(), 'HOME');
    const wish = cat(world).wish;
    expect(advance(world, 30 * DAY).ok).toBe(true);
    expect(advance(world, 30 * DAY).ok).toBe(true);
    expect(cat(world).wish).toEqual(wish);
    // Granted two months on, in full.
    const bond = cat(world).playerBond;
    expect(granted(assign(world, build(world, PLOT.a)))).toHaveLength(1);
    expect(cat(world).playerBond).toBe(bond + WISH.bond);
  });

  it('no new wish the day one is granted; the next day may bring one', () => {
    const world = wishing(rich(), 'HOME');
    expect(advance(world, untilDayStart(world)).ok).toBe(true);
    const day = gameDay(world.getSnapshot().minute);
    // Granted at the very start of the day, after the day’s wishes arose.
    expect(granted(assign(world, build(world, PLOT.a)))).toHaveLength(1);
    expect(cat(world).lastWishDay).toBe(day);
    expect(advance(world, DAY - 1).ok).toBe(true);
    expect(cat(world).wish).toBeNull();
    let next: CatEntity['wish'] = null;
    for (let days = 1; !next && days <= 30; days++) {
      expect(advance(world, untilDayStart(world)).ok).toBe(true);
      next = cat(world).wish;
    }
    expect(next!.sinceDay).toBeGreaterThan(day);
    // However a day starts, a cat granted a wish that day thinks of none.
    const state = world.getSnapshot();
    const mochi = state.cats[0]!;
    for (let later = 1; later <= 40; later++) {
      state.minute = (day + later) * DAY;
      mochi.wish = null;
      mochi.lastWishDay = day + later;
      wishesArise(state);
      expect(mochi.wish).toBeNull();
    }
  });

  it('a rejected command grants nothing and changes nothing', () => {
    const world = wishing(rich(), 'HOME');
    const before = world.save();
    expect(assign(world, 'building-99')).toEqual({
      ok: false,
      error: 'HOME_NOT_FOUND',
    });
    expect(world.save()).toBe(before);
  });
});
