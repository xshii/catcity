import { describe, expect, it } from 'vitest';
import { advance } from '../helpers/world';
import { fishingFixture } from './fishing-fixture';
import { pettingTastes } from '../../src/core';
import { createWorld, loadWorld, World } from '../../src/core/world';
import { SAVE_VERSION, type CatEntity } from '../../src/core/schema';
import { PETTING, PET_SPOTS, type PetSpot } from '../../src/content/petting';
import type { PetStroke } from '../../src/minigames/petting';

const { purr: PURR, mood: MOOD, limit: LIMIT } = PETTING;
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
      'hour',
      'rounds',
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
      hour: Math.floor(before.minute / LIMIT.hourMinutes),
      rounds: 1,
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
      playerBond: 1,
      lastBondMinute: before.minute,
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
    world.dispatch({ type: 'INVITE_PEPPER' });
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

describe('the hourly limit', () => {
  it('counts the first rounds of a game hour in full and later ones half', () => {
    const world = calm(20);
    const moods: unknown[] = [];
    for (let round = 0; round < LIMIT.fullRounds + 2; round++) {
      const result = pet(world, lovely);
      moods.push(result.ok && result.events[0]);
    }
    expect(moods).toMatchObject([
      { mood: LOVELY_MOOD, full: true },
      { mood: LOVELY_MOOD, full: true },
      { mood: LOVELY_MOOD / 2, full: false },
      { mood: LOVELY_MOOD / 2, full: false },
    ]);
    expect(cat(world).mood).toBe(20 + LOVELY_MOOD * 3);
    // The count stops at the limit: it only tells full rounds from later ones.
    expect(cat(world).petting.rounds).toBe(LIMIT.fullRounds);
  });

  it('rounds a halved round down, but never below 1', () => {
    const world = calm(20);
    for (let round = 0; round < LIMIT.fullRounds; round++) pet(world, poor);
    const seven = pet(
      world,
      [...lovely, ...perPurr(tastes.favourite, 1)].sort(
        (a, b) => a.tick - b.tick,
      ),
    );
    expect(seven.ok && seven.events[0]).toMatchObject({ meter: 90, mood: 3 });
    const least = pet(world, poor);
    expect(least.ok && least.events[0]).toMatchObject({ mood: 1, full: false });
  });

  it('does not halve the cost of an unkind round', () => {
    const world = calm();
    for (let round = 0; round < LIMIT.fullRounds; round++) pet(world, poor);
    const result = pet(world, unkind);
    expect(result.ok && result.events[0]).toMatchObject({
      mood: -MOOD.disliked,
      full: false,
    });
  });

  it('starts over with the next game hour, for each cat by itself', () => {
    const world = createWorld(SEED);
    world.dispatch({ type: 'INVITE_PEPPER' });
    const pepper = cat(world, 1).id;
    for (let round = 0; round < LIMIT.fullRounds; round++) pet(world, poor);
    const other = pet(world, poor, pepper);
    expect(other.ok && other.events[0]).toMatchObject({ full: true });
    const minute = world.getSnapshot().minute;
    advance(world, LIMIT.hourMinutes - (minute % LIMIT.hourMinutes) - 1);
    const late = pet(world, poor);
    expect(late.ok && late.events[0]).toMatchObject({ full: false });
    advance(world, 1);
    const fresh = pet(world, poor);
    expect(fresh.ok && fresh.events[0]).toMatchObject({ full: true });
    expect(cat(world).petting).toMatchObject({
      hour: world.getSnapshot().minute / LIMIT.hourMinutes,
      rounds: 1,
    });
  });
});

describe('the bond', () => {
  it('grows with a good round, through the shared hourly rule', () => {
    const world = calm();
    pet(world, lovely);
    expect(cat(world)).toMatchObject({
      playerBond: 1,
      lastBondMinute: world.getSnapshot().minute,
    });
    pet(world, lovely);
    expect(cat(world).playerBond).toBe(1);
    advance(world, 60);
    pet(world, lovely);
    expect(cat(world).playerBond).toBe(2);
  });

  it('does not grow with a round below half a meter', () => {
    const world = calm();
    const result = pet(world, perPurr(tastes.favourite, 4));
    expect(result.ok && result.events[0]).toMatchObject({ meter: 40 });
    expect(cat(world)).toMatchObject({ playerBond: 0, lastBondMinute: null });
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
    world.dispatch({ type: 'INVITE_PEPPER' });
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

  it('are version 19 and carry what was found out and the hour’s count', () => {
    expect(SAVE_VERSION).toBe(19);
    const world = played();
    const save = world.save();
    const loaded = loadWorld(save);
    expect(loaded.save()).toBe(save);
    expect(cat(loaded).petting).toEqual(cat(world).petting);
    // The limit goes on after a load.
    pet(loaded, poor);
    const third = pet(loaded, poor);
    expect(third.ok && third.events[0]).toMatchObject({ full: false });
  });

  it.each([
    ['a spot found out twice', { discovered: [neutral, neutral] }],
    [
      'spots out of listing order',
      { discovered: [PET_SPOTS[1], PET_SPOTS[0]] },
    ],
    ['an unknown spot', { discovered: ['TAIL'] }],
    ['an hour yet to come', { hour: 1_000_000 }],
    ['rounds in no hour', { hour: null, rounds: 1 }],
    ['an hour without rounds', { rounds: 0 }],
    ['more rounds than the limit counts', { rounds: LIMIT.fullRounds + 1 }],
    ['saved tastes', { favourite: 'HEAD' }],
  ])('reject %s', (_, change) => {
    const save = JSON.parse(played().save());
    expect(() => loadWorld(JSON.stringify(save))).not.toThrow();
    Object.assign(save.world.cats[0].petting, change);
    expect(() => loadWorld(JSON.stringify(save))).toThrow();
  });

  it('reject a cat without the field', () => {
    const save = JSON.parse(played().save());
    delete save.world.cats[0].petting;
    expect(() => loadWorld(JSON.stringify(save))).toThrow();
  });
});
