import { WORLD_LIMIT } from '../../src/core/limits';
import { advance, buildCafe, interact } from '../helpers/world';
import { describe, expect, it } from 'vitest';
import { createWorld, loadWorld } from '../../src/core/world';
import { RandomService } from '../../src/core/random';

describe('headless world', () => {
  it('creates an independent persistent Mochi in a 10×10 world', () => {
    const world = createWorld(42);
    const snapshot = world.getSnapshot();
    expect(snapshot).toMatchObject({
      seed: 42,
      coins: 1000,
      minute: 0,
      map: { width: 10, height: 10 },
    });
    expect(snapshot.cats[0]).toMatchObject({
      id: 'mochi',
      name: 'Mochi',
      personality: ['shy', 'food-loving', 'slow-to-warm'],
      mood: 70,
    });
    snapshot.coins = 0;
    snapshot.cats[0]!.name = 'Changed';
    expect(world.getSnapshot().coins).toBe(1000);
    expect(world.getSnapshot().cats[0]!.name).toBe('Mochi');
  });

  it('builds a cafe and charges exactly once', () => {
    const world = createWorld(42);
    expect(buildCafe(world, { x: 3, y: 3 }).ok).toBe(true);
    expect(world.getSnapshot().coins).toBe(700);
    expect(world.getSnapshot().buildings[0]).toMatchObject({
      type: 'CAT_CAFE',
      position: { x: 3, y: 3 },
    });
    const before = world.save();
    expect(buildCafe(world, { x: 3, y: 3 }).ok).toBe(false);
    expect(world.save()).toBe(before);
  });

  it.each([
    { x: -1, y: 0 },
    { x: 10, y: 0 },
    { x: 0.5, y: 0 },
    { x: NaN, y: 2 },
    { x: 5, y: 5 },
  ])('rejects invalid placement %j atomically', (position) => {
    const world = createWorld(42);
    const before = world.save();
    expect(buildCafe(world, position).ok).toBe(false);
    expect(world.save()).toBe(before);
  });

  it('rejects insufficient funds without changes', () => {
    const save = JSON.parse(createWorld(1).save());
    save.world.coins = 299;
    const world = loadWorld(JSON.stringify(save));
    const before = world.save();
    expect(buildCafe(world, { x: 3, y: 3 })).toMatchObject({
      ok: false,
      error: 'INSUFFICIENT_COINS',
    });
    expect(world.save()).toBe(before);
  });

  it('counts income from construction, including partial hours', () => {
    const world = createWorld(42);
    advance(world, 25);
    buildCafe(world, { x: 3, y: 3 });
    advance(world, 59);
    expect(world.getSnapshot().coins).toBe(700);
    advance(world, 1);
    expect(world.getSnapshot().coins).toBe(710);
    advance(world, 120);
    expect(world.getSnapshot().coins).toBe(730);
  });

  it.each([-1, 0.5, NaN, Infinity, 43201])(
    'rejects invalid time %s',
    (minutes) => {
      const world = createWorld(1);
      const before = world.save();
      expect(advance(world, minutes).ok).toBe(false);
      expect(world.save()).toBe(before);
    },
  );

  it('rejects unknown commands and forged interaction fields', () => {
    const world = createWorld(1);
    expect(world.dispatch({ type: 'FREE_MONEY', amount: 100 })).toMatchObject({
      ok: false,
      error: 'INVALID_COMMAND',
    });
    expect(
      world.dispatch({
        type: 'INTERACT',
        catId: 'mochi',
        message: 'hi',
        reply: 'hello',
        coins: 9999,
      }).ok,
    ).toBe(false);
  });

  it('stores structured memories, caps history and rate-limits bond rewards', () => {
    const world = createWorld(42);
    for (let i = 0; i < 55; i++)
      expect(interact(world, 'mochi', `hello ${i}`, '喵。').ok).toBe(true);
    const cat = world.getSnapshot().cats[0]!;
    expect(cat.memories).toHaveLength(50);
    expect(cat.memories.at(-1)).toMatchObject({
      kind: 'conversation',
      minute: 0,
      message: 'hello 54',
    });
    expect(cat.playerBond).toBe(1);
    advance(world, 60);
    interact(world, 'mochi', 'hello again', '喵。');
    expect(world.getSnapshot().cats[0]!.playerBond).toBe(2);
    expect(interact(world, 'missing', 'hi', 'hi').ok).toBe(false);
  });

  it('uses repeatable independent RNG streams and restores their state', () => {
    const first = new RandomService(42);
    const second = new RandomService(42);
    const values = Array.from({ length: 20 }, () => first.nextInt(10));
    expect(values).toEqual(
      Array.from({ length: 20 }, () => second.nextInt(10)),
    );
    expect(new Set(values).size).toBeGreaterThan(1);
    const resumed = new RandomService(first.state);
    expect(resumed.nextInt(100)).toBe(first.nextInt(100));
  });

  it('emits causally useful events without putting diagnostics in save state', () => {
    const world = createWorld(1);
    expect(buildCafe(world, { x: 3, y: 3 })).toMatchObject({
      ok: true,
      events: [{ type: 'BuildingBuilt', cost: 300 }],
    });
    const result = advance(world, 60);
    expect(
      result.ok &&
        result.events.some((event) => event.type === 'IncomeGenerated'),
    ).toBe(true);
    expect(world.getSnapshot()).not.toHaveProperty('events');
  });
});

it('keeps time running when cafe income reaches the coin limit', () => {
  const world = createWorld(42);
  buildCafe(world, { x: 4, y: 4 });
  const save = JSON.parse(world.save());
  save.world.coins = WORLD_LIMIT - 5;
  const capped = loadWorld(JSON.stringify(save));
  expect(capped.dispatch({ type: 'ADVANCE_TIME', minutes: 120 }).ok).toBe(true);
  expect(capped.getSnapshot()).toMatchObject({
    minute: save.world.minute + 120,
    coins: WORLD_LIMIT,
  });
});

it('checks a command without applying it: same outcome as dispatch, world unchanged', () => {
  const world = createWorld(42);
  const before = world.save();
  const build = {
    type: 'BUILD_BUILDING',
    buildingType: 'CAT_CAFE',
    position: { x: 4, y: 4 },
  } as const;
  expect(world.check(build)).toEqual({ ok: true });
  expect(world.check({ ...build, position: { x: 4, y: 2 } })).toEqual({
    ok: false,
    error: 'LAND_NOT_OWNED',
  });
  expect(world.check({ type: 'NOT_A_COMMAND' })).toEqual({
    ok: false,
    error: 'INVALID_COMMAND',
  });
  expect(world.save()).toBe(before);
  expect(world.dispatch(build).ok).toBe(true);
});
