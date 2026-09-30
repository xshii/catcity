import { describe, expect, it } from 'vitest';
import { KITTEN_MINUTES, NEUTER_PRICE } from '../../src/content/family';
import { loadWorld, World, type WorldState } from '../../src/core';
import { breedBlocks } from '../../src/core/family';
import { applyCommand } from '../../src/core/reducer';
import { readyPair } from '../helpers/family';

// Spec 041 R-30 (design 5.2): a grown cat is neutered once, for a small price, and can
// have no kittens after.

const neuter = (world: World, catId: string) =>
  world.dispatch({ type: 'NEUTER_CAT', catId });
/** Mochi and Pepper, ready to have a kitten, with `coins`. */
const pair = (coins?: number) => {
  const world = readyPair();
  return coins === undefined
    ? world
    : new World({ ...world.getSnapshot(), coins });
};

describe('NEUTER_CAT (spec 041 R-30)', () => {
  it('costs 100 coins and needs no building (D-3)', () => {
    expect(NEUTER_PRICE).toBe(100);
  });

  it('charges the price and marks the cat neutered, and changes nothing else', () => {
    const world = pair();
    const before = world.getSnapshot();
    const pepper = before.cats[1]!;
    expect(neuter(world, pepper.id)).toEqual({
      ok: true,
      events: [
        {
          type: 'CatNeutered',
          minute: before.minute,
          entityId: pepper.id,
          cost: NEUTER_PRICE,
        },
      ],
    });
    expect(world.getSnapshot()).toEqual({
      ...before,
      coins: before.coins - NEUTER_PRICE,
      cats: before.cats.map((cat) =>
        cat.id === pepper.id ? { ...cat, neutered: true } : cat,
      ),
    });
  });

  it('takes exactly the price: 100 coins are enough', () => {
    const world = pair(NEUTER_PRICE);
    expect(neuter(world, 'mochi').ok).toBe(true);
    expect(world.getSnapshot().coins).toBe(0);
  });

  it('keeps the cat from having kittens: the conditions of T-21 see it', () => {
    const world = pair();
    const [mochi, pepper] = world.getSnapshot().cats;
    expect(breedBlocks(world.getSnapshot(), mochi!.id, pepper!.id)).toEqual([]);
    expect(neuter(world, pepper!.id).ok).toBe(true);
    expect(breedBlocks(world.getSnapshot(), mochi!.id, pepper!.id)).toEqual([
      'NEUTERED',
    ]);
  });

  it('is kept by a save and its load: the save format is the same', () => {
    const world = pair();
    expect(neuter(world, 'mochi').ok).toBe(true);
    const save = world.save();
    expect(loadWorld(save).getSnapshot().cats[0]!.neutered).toBe(true);
    expect(loadWorld(save).save()).toBe(save);
  });
});

describe('NEUTER_CAT rejections leave the world unchanged', () => {
  const rejects = (world: World, catId: string, error: string) => {
    const before = world.save();
    expect(neuter(world, catId)).toEqual({ ok: false, error });
    expect(world.save()).toBe(before);
  };

  it('a cat neutered already: once, never undone', () => {
    const world = pair();
    expect(neuter(world, 'mochi').ok).toBe(true);
    rejects(world, 'mochi', 'ALREADY_NEUTERED');
    // Its own reason comes first, before the coins.
    rejects(
      new World({ ...world.getSnapshot(), coins: 0 }),
      'mochi',
      'ALREADY_NEUTERED',
    );
  });

  it('without the coins: 99 are not enough', () => {
    rejects(pair(NEUTER_PRICE - 1), 'mochi', 'INSUFFICIENT_COINS');
  });

  it('a cat not in the city, or a command without one', () => {
    rejects(pair(), 'ghost', 'CAT_NOT_FOUND');
    const world = pair();
    const before = world.save();
    expect(world.dispatch({ type: 'NEUTER_CAT' })).toEqual({
      ok: false,
      error: 'INVALID_COMMAND',
    });
    expect(
      world.dispatch({ type: 'NEUTER_CAT', catId: 'mochi', price: 0 }),
    ).toEqual({ ok: false, error: 'INVALID_COMMAND' });
    expect(world.save()).toBe(before);
  });

  it('a kitten, until the minute it grows up (design 5.5)', () => {
    // No cat can be born yet (T-22), so no valid save holds a kitten: the rule is applied
    // to a world state directly, as World.dispatch applies it to its copy.
    const grown = { ...pair(0).getSnapshot(), minute: 10 * 1440 };
    const born = (minutesAgo: number): WorldState => ({
      ...grown,
      cats: grown.cats.map((cat, index) =>
        index === 1 ? { ...cat, bornMinute: grown.minute - minutesAgo } : cat,
      ),
    });
    const pepper = grown.cats[1]!.id;
    const command = { type: 'NEUTER_CAT', catId: pepper } as const;
    const kitten = born(KITTEN_MINUTES - 1);
    const untouched = structuredClone(kitten);
    // Too young comes first, before the coins it lacks too.
    expect(() => applyCommand(kitten, command)).toThrow('CAT_TOO_YOUNG');
    expect(kitten).toEqual(untouched);
    const adult = { ...born(KITTEN_MINUTES), coins: NEUTER_PRICE };
    expect(applyCommand(adult, command)).toEqual([
      {
        type: 'CatNeutered',
        minute: adult.minute,
        entityId: pepper,
        cost: NEUTER_PRICE,
      },
    ]);
    expect(adult.cats[1]!.neutered).toBe(true);
  });
});
