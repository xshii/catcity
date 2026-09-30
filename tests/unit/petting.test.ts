import { describe, expect, it } from 'vitest';
import { advance, invite } from '../helpers/world';
import { fishingFixture } from './fishing-fixture';
import { pettingTastes } from '../../src/core';
import { createWorld, loadWorld, World } from '../../src/core/world';
import { SAVE_VERSION, type CatEntity } from '../../src/core/schema';
import { gameDay } from '../../src/core/bond';
import { BOND, CARE } from '../../src/content/care';
import { MOOD as CAT_MOOD } from '../../src/content/mood';
import { PETTING, PET_SPOTS, type PetSpot } from '../../src/content/petting';
import type { PetStroke } from '../../src/minigames/petting';

const { purr: PURR, mood: MOOD } = PETTING;
const { rounds: LIFTS, windowMinutes: WINDOW } = CARE.pettingLifts;
const SEED = 42;
const tastes = pettingTastes(SEED, 'mochi');
const neutral = PET_SPOTS.find(
  (spot) => spot !== tastes.favourite && spot !== tastes.disliked,
)!;

/** One stroke at the start of each of the first `strokes` purrs. */
const perPurr = (spot: PetSpot, strokes: number): PetStroke[] =>
  Array.from({ length: strokes }, (_, index) => ({
    tick: index * PURR.periodTicks,
    spot,
  }));
/** Eight purring strokes on the favourite: a good round, worth 6. */
const lovely = perPurr(tastes.favourite, 8);
const LOVELY_MOOD = 6;
/** Two light strokes: a poor round, worth the least. */
const poor = perPurr(neutral, 2);
const unkind = perPurr(tastes.disliked, 3);

const pet = (world: World, strokes: PetStroke[], catId = 'mochi') =>
  world.dispatch({ type: 'PET_CAT', catId, strokes });
const cat = (world: World, index = 0) => world.getSnapshot().cats[index]!;
function edited(world: World, change: (cat: CatEntity) => void): World {
  const state = world.getSnapshot();
  change(state.cats[0]!);
  return new World(state);
}
const calm = (mood = 50) =>
  edited(createWorld(SEED), (cat) => (cat.mood = mood));

describe('a cat’s tastes', () => {
  it('are fixed by the world seed and the cat, and never the same spot twice', () => {
    for (let seed = 0; seed < 200; seed++)
      for (const id of ['mochi', 'cat-1', 'cat-27']) {
        const found = pettingTastes(seed, id);
        expect(pettingTastes(seed, id)).toEqual(found);
        expect(PET_SPOTS).toContain(found.favourite);
        expect(PET_SPOTS).toContain(found.disliked);
        expect(found.favourite).not.toBe(found.disliked);
      }
  });

  it('differ between cats and between worlds, each spot about as often', () => {
    const favourites = new Map<PetSpot, number>();
    const pairs = new Set<string>();
    const SAMPLES = 800;
    for (let seed = 0; seed < SAMPLES / 2; seed++)
      for (const id of ['mochi', 'cat-3']) {
        const { favourite, disliked } = pettingTastes(seed * 7919, id);
        favourites.set(favourite, (favourites.get(favourite) ?? 0) + 1);
        pairs.add(`${favourite}/${disliked}`);
      }
    expect(pairs.size).toBe(PET_SPOTS.length * (PET_SPOTS.length - 1));
    for (const spot of PET_SPOTS) {
      expect(favourites.get(spot)).toBeGreaterThan(SAMPLES / 4 - 60);
      expect(favourites.get(spot)).toBeLessThan(SAMPLES / 4 + 60);
    }
  });

  it('are not saved: a cat holds only what the player has found out', () => {
    expect(Object.keys(cat(createWorld(SEED)).petting).sort()).toEqual([
      'discovered',
      'lifted',
    ]);
  });
});

describe('PET_CAT', () => {
  it('settles a round from its strokes: mood, what was found out, one event', () => {
    const world = calm();
    const before = world.getSnapshot();
    const result = pet(world, [...lovely, { tick: 235, spot: neutral }]);
    expect(result).toEqual({
      ok: true,
      events: [
        {
          type: 'CatPetted',
          minute: before.minute,
          entityId: 'mochi',
          spot: tastes.favourite,
          meter: 81,
          mood: LOVELY_MOOD,
          full: true,
        },
      ],
    });
    const after = world.getSnapshot();
    expect(after.cats[0]!.mood).toBe(50 + LOVELY_MOOD);
    expect(after.cats[0]!.petting).toEqual({
      discovered: PET_SPOTS.filter(
        (spot) => spot === tastes.favourite || spot === neutral,
      ),
      lifted: [before.minute],
    });
  });

  it('costs nothing and needs no place: a walking cat can be petted', () => {
    const world = calm();
    const home = cat(world).position;
    expect(
      world.dispatch({
        type: 'WALK_CAT',
        catId: 'mochi',
        destination: { x: 4, y: 4 },
      }).ok,
    ).toBe(true);
    const before = world.getSnapshot();
    expect(before.cats[0]!.walk).not.toBeNull();
    expect(pet(world, lovely).ok).toBe(true);
    const after = world.getSnapshot();
    expect(after.cats[0]).toEqual({
      ...before.cats[0]!,
      mood: before.cats[0]!.mood + LOVELY_MOOD,
      playerBond: BOND.petting,
      pettingBond: { day: gameDay(before.minute), count: 1 },
      petting: after.cats[0]!.petting,
    });
    expect({ ...after, cats: [] }).toEqual({ ...before, cats: [] });
    expect(after.cats[0]!.position).toEqual(home);
  });

  it('keeps what was found out in earlier rounds, in listing order', () => {
    const world = calm();
    pet(world, perPurr(PET_SPOTS[3], 1));
    pet(world, perPurr(PET_SPOTS[0], 1));
    pet(world, perPurr(PET_SPOTS[3], 1));
    expect(cat(world).petting.discovered).toEqual([PET_SPOTS[0], PET_SPOTS[3]]);
  });

  it('takes a little mood for a round mostly on the disliked spot', () => {
    const world = calm();
    const result = pet(world, unkind);
    expect(result.ok && result.events[0]).toMatchObject({
      mood: -MOOD.disliked,
      meter: 0,
      spot: tastes.disliked,
    });
    expect(cat(world).mood).toBe(50 - MOOD.disliked);
    expect(cat(world).petting.discovered).toEqual([tastes.disliked]);
    expect(cat(world).playerBond).toBe(0);
  });

  it('keeps mood within 0 and 100', () => {
    const happy = calm(98);
    pet(happy, lovely);
    expect(cat(happy).mood).toBe(100);
    const low = calm(0);
    pet(low, unkind);
    expect(cat(low).mood).toBe(0);
  });

  it('only changes the cat that was petted', () => {
    const world = createWorld(SEED);
    invite(world);
    const before = world.getSnapshot();
    const pepper = before.cats[1]!;
    expect(
      pet(
        world,
        perPurr(pettingTastes(SEED, pepper.id).favourite, 8),
        pepper.id,
      ).ok,
    ).toBe(true);
    expect(cat(world, 0)).toEqual(before.cats[0]);
    expect(cat(world, 1).mood).toBe(pepper.mood + LOVELY_MOOD);
  });
});

describe('mood from a round (spec 041 R-21)', () => {
  const half = (amount: number) => Math.max(1, Math.floor(amount / 2));
  /** What one lovely round adds to a cat in `mood`, as the event tells it and in fact. */
  const lifted = (mood: number) => {
    const world = calm(mood);
    const result = pet(world, lovely);
    expect(result.ok && result.events[0]).toMatchObject({
      mood: cat(world).mood - mood,
    });
    return cat(world).mood - mood;
  };

  it('lifts a calm cat in full, over the happy line', () => {
    expect(lifted(CAT_MOOD.happy - 1)).toBe(LOVELY_MOOD);
    expect(CAT_MOOD.happy - 1 + LOVELY_MOOD).toBeGreaterThan(CAT_MOOD.happy);
  });

  it('gives a happy cat half, as every gain does (spec 038)', () => {
    expect(lifted(CAT_MOOD.happy)).toBe(half(LOVELY_MOOD));
    expect(lifted(90)).toBe(half(LOVELY_MOOD));
  });

  it('takes a round mostly on the disliked spot whole from a happy cat', () => {
    const world = calm(90);
    pet(world, unkind);
    expect(cat(world).mood).toBe(90 - MOOD.disliked);
  });
});

describe('the mood allowance (user 2026-09-30)', () => {
  /** The events of `rounds` lovely rounds, one after another. */
  const rounds = (world: World, count: number, strokes = lovely) =>
    Array.from({ length: count }, () => {
      const result = pet(world, strokes);
      return result.ok && result.events[0];
    });

  it('lifts mood with at most its rounds in any window of game minutes; later ones lift nothing', () => {
    const world = calm(20);
    const minute = world.getSnapshot().minute;
    expect(rounds(world, LIFTS + 2)).toMatchObject([
      ...Array.from({ length: LIFTS }, () => ({
        mood: LOVELY_MOOD,
        full: true,
      })),
      { mood: 0, full: false },
      { mood: 0, full: false },
    ]);
    expect(cat(world).mood).toBe(20 + LIFTS * LOVELY_MOOD);
    // Only the rounds that lifted mood are kept, as many as the allowance holds.
    expect(cat(world).petting.lifted).toEqual(
      Array.from({ length: LIFTS }, () => minute),
    );
  });

  it('frees a round as the oldest lift leaves the window: it slides, it is no clock hour', () => {
    const HOUR = 60;
    expect((LIFTS - 1) * HOUR).toBeLessThan(WINDOW);
    const world = calm(20);
    const start = world.getSnapshot().minute;
    const at = (minute: number) =>
      advance(world, minute - world.getSnapshot().minute);
    for (let round = 0; round < LIFTS; round++) {
      at(start + round * HOUR);
      expect(rounds(world, 1, poor)).toMatchObject([{ full: true }]);
    }
    at(start + WINDOW - 1);
    expect(rounds(world, 1, poor)).toMatchObject([{ mood: 0, full: false }]);
    at(start + WINDOW);
    // The first lift has left; the second is still in the window.
    expect(rounds(world, 2, poor)).toMatchObject([
      { full: true },
      { mood: 0, full: false },
    ]);
    at(start + WINDOW + HOUR);
    expect(rounds(world, 1, poor)).toMatchObject([{ full: true }]);
    expect(cat(world).petting.lifted).toEqual([
      ...Array.from(
        { length: LIFTS - 2 },
        (_, round) => start + (round + 2) * HOUR,
      ),
      start + WINDOW,
      start + WINDOW + HOUR,
    ]);
  });

  it('an unkind round takes its 1 in full and uses none of the allowance', () => {
    const world = calm();
    expect(rounds(world, 1, unkind)).toMatchObject([
      { mood: -MOOD.disliked, full: true },
    ]);
    expect(cat(world).petting.lifted).toEqual([]);
    expect(rounds(world, LIFTS, poor)).toMatchObject(
      Array.from({ length: LIFTS }, () => ({ full: true })),
    );
    // Past the allowance an unkind round still takes its 1.
    expect(rounds(world, 1, unkind)).toMatchObject([
      { mood: -MOOD.disliked, full: true },
    ]);
  });

  it('is each cat’s own', () => {
    const world = createWorld(SEED);
    invite(world);
    const pepper = cat(world, 1).id;
    rounds(world, LIFTS, poor);
    expect(rounds(world, 1, poor)).toMatchObject([{ full: false }]);
    const other = pet(world, poor, pepper);
    expect(other.ok && other.events[0]).toMatchObject({ full: true });
  });
});

describe('the bond (spec 041 R-20)', () => {
  it('grows by its points with each of the first good rounds of a game day, then no more that day', () => {
    // Low enough that no round makes the cat happy.
    const world = calm(20);
    const bonds: number[] = [];
    for (let round = 1; round <= BOND.pettingPerDay + 1; round++) {
      pet(world, lovely);
      bonds.push(cat(world).playerBond);
    }
    expect(bonds).toEqual(
      bonds.map(
        (_, index) => Math.min(index + 1, BOND.pettingPerDay) * BOND.petting,
      ),
    );
    expect(cat(world).mood).toBeLessThan(CAT_MOOD.happy);
    expect(cat(world).pettingBond).toEqual({
      day: gameDay(world.getSnapshot().minute),
      count: BOND.pettingPerDay,
    });
  });

  it('gives one more to a cat that is happy as the round begins', () => {
    const happy = calm(CAT_MOOD.happy);
    pet(happy, lovely);
    expect(cat(happy).playerBond).toBe(BOND.petting + BOND.happy);
    // The round's own mood comes after: a round that makes the cat happy earns the plain points.
    const cheered = calm(CAT_MOOD.happy - 1);
    pet(cheered, lovely);
    expect(cat(cheered).mood).toBeGreaterThanOrEqual(CAT_MOOD.happy);
    expect(cat(cheered).playerBond).toBe(BOND.petting);
  });

  it('does not grow with a round below half a meter, which leaves the day’s rounds as they were', () => {
    const world = calm(20);
    const result = pet(world, perPurr(tastes.favourite, 4));
    expect(result.ok && result.events[0]).toMatchObject({ meter: 40 });
    expect(cat(world)).toMatchObject({ playerBond: 0, pettingBond: null });
    for (let round = 0; round < BOND.pettingPerDay; round++) pet(world, lovely);
    expect(cat(world).playerBond).toBe(BOND.pettingPerDay * BOND.petting);
  });

  it('starts over with the next game day, for each cat by itself', () => {
    const world = calm(20);
    invite(world);
    const pepper = cat(world, 1).id;
    const bonds = () => world.getSnapshot().cats.map((cat) => cat.playerBond);
    for (let round = 0; round < BOND.pettingPerDay; round++) pet(world, lovely);
    pet(world, perPurr(pettingTastes(SEED, pepper).favourite, 8), pepper);
    const full = BOND.pettingPerDay * BOND.petting;
    expect(bonds()).toEqual([full, BOND.petting]);
    const minute = world.getSnapshot().minute;
    advance(world, BOND.dayMinutes - (minute % BOND.dayMinutes) - 1);
    pet(world, lovely);
    expect(bonds()).toEqual([full, BOND.petting]);
    advance(world, 1);
    expect(cat(world).mood).toBeLessThan(CAT_MOOD.happy);
    pet(world, lovely);
    expect(bonds()).toEqual([full + BOND.petting, BOND.petting]);
  });
});

describe('a rejected round leaves the world unchanged', () => {
  const stroke = (tick: number, spot: string = neutral) => ({ tick, spot });
  it.each([
    ['an unknown cat', 'ghost', lovely, 'CAT_NOT_FOUND'],
    ['no strokes', 'mochi', [], 'INVALID_COMMAND'],
    ['an unknown spot', 'mochi', [stroke(0, 'TAIL')], 'INVALID_COMMAND'],
    ['a stroke before the round', 'mochi', [stroke(-1)], 'INVALID_COMMAND'],
    [
      'a stroke after the round',
      'mochi',
      [stroke(PETTING.roundTicks)],
      'INVALID_COMMAND',
    ],
    ['a fraction of a tick', 'mochi', [stroke(1.5)], 'INVALID_COMMAND'],
    [
      'strokes out of order',
      'mochi',
      [stroke(9), stroke(8)],
      'INVALID_COMMAND',
    ],
    [
      'more strokes than a round has ticks',
      'mochi',
      Array.from({ length: PETTING.roundTicks + 1 }, () => stroke(0)),
      'INVALID_COMMAND',
    ],
  ])('%s', (_, catId, strokes, error) => {
    const world = calm();
    const saved = world.save();
    expect(world.dispatch({ type: 'PET_CAT', catId, strokes })).toEqual({
      ok: false,
      error,
    });
    expect(world.save()).toBe(saved);
  });

  it('a client-reported result', () => {
    const world = calm();
    const saved = world.save();
    expect(
      world.dispatch({
        type: 'PET_CAT',
        catId: 'mochi',
        strokes: poor,
        mood: 8,
      }),
    ).toEqual({ ok: false, error: 'INVALID_COMMAND' });
    expect(world.save()).toBe(saved);
  });

  it('a cat in a fishing run; another cat can still be petted', () => {
    const world = fishingFixture(SEED);
    invite(world);
    world.dispatch({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      spotId: 'POND',
      baitId: 'BREAD',
      direction: -30,
      aimDepth: 50,
    });
    expect(world.getSnapshot().fishing.active?.catId).toBe('mochi');
    const saved = world.save();
    expect(pet(world, poor)).toEqual({ ok: false, error: 'CAT_BUSY' });
    expect(world.save()).toBe(saved);
    expect(
      world.check({ type: 'PET_CAT', catId: 'mochi', strokes: poor }),
    ).toEqual({ ok: false, error: 'CAT_BUSY' });
    expect(pet(world, poor, cat(world, 1).id).ok).toBe(true);
  });
});

describe('saves', () => {
  const played = () => {
    const world = calm();
    pet(world, [...lovely, { tick: 235, spot: neutral }]);
    return world;
  };

  it('are version 22 and carry what was found out and the lifts in the window', () => {
    expect(SAVE_VERSION).toBe(22);
    const world = played();
    const save = world.save();
    const loaded = loadWorld(save);
    expect(loaded.save()).toBe(save);
    expect(cat(loaded).petting).toEqual(cat(world).petting);
    // The allowance goes on after a load.
    for (let round = 1; round < LIFTS; round++) pet(loaded, poor);
    const past = pet(loaded, poor);
    expect(past.ok && past.events[0]).toMatchObject({ full: false });
  });

  it.each([
    ['a spot found out twice', { discovered: [neutral, neutral] }],
    [
      'spots out of listing order',
      { discovered: [PET_SPOTS[1], PET_SPOTS[0]] },
    ],
    ['an unknown spot', { discovered: ['TAIL'] }],
    ['a lift yet to come', { lifted: [1_000_000] }],
    ['lifts out of order', { lifted: [2, 1] }],
    [
      'more lifts than the allowance',
      { lifted: Array.from({ length: LIFTS + 1 }, () => 0) },
    ],
    ['the old hourly count', { hour: 7, rounds: 1 }],
    ['saved tastes', { favourite: 'HEAD' }],
  ])('reject %s', (_, change) => {
    const save = JSON.parse(played().save());
    expect(() => loadWorld(JSON.stringify(save))).not.toThrow();
    Object.assign(save.world.cats[0].petting, change);
    expect(() => loadWorld(JSON.stringify(save))).toThrow();
  });

  it.each([
    ['a counted round on a day yet to come', { day: 1_000_000, count: 1 }],
    ['a day without a counted round', { day: 0, count: 0 }],
    [
      'more counted rounds than a day allows',
      { day: 0, count: BOND.pettingPerDay + 1 },
    ],
  ])('reject %s', (_, pettingBond) => {
    const save = JSON.parse(played().save());
    expect(save.world.cats[0].pettingBond).toEqual({ day: 0, count: 1 });
    save.world.cats[0].pettingBond = pettingBond;
    expect(() => loadWorld(JSON.stringify(save))).toThrow();
  });

  it.each(['petting', 'pettingBond'])('reject a cat without %s', (field) => {
    const save = JSON.parse(played().save());
    delete save.world.cats[0][field];
    expect(() => loadWorld(JSON.stringify(save))).toThrow();
  });
});
