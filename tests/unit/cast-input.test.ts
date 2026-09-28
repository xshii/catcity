import { fishingFixture as createWorld } from './fishing-fixture';
import { expect, it } from 'vitest';
import { loadWorld } from '../../src/core/world';
import {
  castAngling,
  initialAngling,
  stepAngling,
} from '../../src/minigames/angling';

it('accepts two-dimensional aim and explicit power while spending energy and bait only once', () => {
  const world = createWorld(42);
  expect(
    world.dispatch({
      spotId: 'POND',

      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'WORM',
      direction: -25,
      aimDepth: 82,
    }).ok,
  ).toBe(true);
  const before = world.getSnapshot();
  // Preparing is free; the cast pays below.
  expect(before.cats[0]!.needs.energy).toBe(100);
  expect(before.fishing.baits.WORM).toBe(6);
  const runId = before.fishing.active!.id;
  expect(world.dispatch({ type: 'FISH_CAST', runId, power: 72 }).ok).toBe(true);
  const after = world.getSnapshot();
  expect(after.fishing.active).toMatchObject({
    direction: -25,
    aimDepth: 82,
    power: 72,
    phase: 'waiting',
    phaseTick: 0,
    tick: 1,
    hasHeld: true,
    pressed: false,
    precision: true,
  });
  expect(after.cats[0]!.needs.energy).toBe(92);
  expect(after.fishing.baits.WORM).toBe(5);
  expect(after.minute).toBe(0);
  expect(after.nextId).toBe(before.nextId);
  const cast = world.save();
  expect(world.dispatch({ type: 'FISH_CAST', runId, power: 100 })).toEqual({
    ok: false,
    error: 'CAST_NOT_READY',
  });
  expect(world.save()).toBe(cast);
});

it('rejects invalid aim, power, forged fields and wrong runs atomically; accepts an explicit center aim', () => {
  const world = createWorld(42);
  const initial = world.save();
  for (const aimDepth of [-1, 101, 12.5, NaN, Infinity]) {
    expect(
      world.dispatch({
        spotId: 'POND',

        type: 'FISH_BEGIN',
        catId: 'mochi',
        baitId: 'BREAD',
        direction: 0,
        aimDepth,
      }),
    ).toEqual({ ok: false, error: 'INVALID_COMMAND' });
    expect(world.save()).toBe(initial);
  }
  expect(
    world.dispatch({ type: 'FISH_CAST', runId: 'angling-1', power: 50 }),
  ).toEqual({ ok: false, error: 'RUN_NOT_FOUND' });
  expect(world.save()).toBe(initial);
  world.dispatch({
    spotId: 'POND',
    aimDepth: 50,

    type: 'FISH_BEGIN',
    catId: 'mochi',
    baitId: 'BREAD',
    direction: 0,
  });
  expect(world.getSnapshot().fishing.active!.aimDepth).toBe(50);
  const runId = world.getSnapshot().fishing.active!.id;
  const charge = world.save();
  for (const power of [-1, 101, 1.5, NaN, Infinity]) {
    expect(world.dispatch({ type: 'FISH_CAST', runId, power })).toEqual({
      ok: false,
      error: 'INVALID_COMMAND',
    });
    expect(world.save()).toBe(charge);
  }
  expect(
    world.dispatch({
      type: 'FISH_CAST',
      runId,
      power: 70,
      speciesId: 'MOON_CARP',
    }),
  ).toEqual({ ok: false, error: 'INVALID_COMMAND' });
  expect(
    world.dispatch({ type: 'FISH_CAST', runId: 'angling-999', power: 70 }),
  ).toEqual({ ok: false, error: 'RUN_NOT_FOUND' });
  expect(world.save()).toBe(charge);
  world.dispatch({ type: 'FISH_CANCEL', runId });
  const cancelled = world.save();
  expect(world.dispatch({ type: 'FISH_CAST', runId, power: 70 })).toEqual({
    ok: false,
    error: 'RUN_NOT_FOUND',
  });
  expect(world.save()).toBe(cancelled);
});

it('uses the same pure cast transition for explicit power and release, including low and full power', () => {
  for (const chargeTicks of [1, 18, 23, 32, 64]) {
    let run = initialAngling({
      mode: 'buttons',
      catBreed: 'RAGDOLL',

      id: 'angling-1',
      catId: 'mochi',
      seed: 42,
      baitId: 'SHRIMP',
      direction: 30,
      skillLevel: 3,
      spotId: 'COAST',
      aimDepth: 75,
    });
    for (let tick = 0; tick < chargeTicks; tick++)
      run = stepAngling(run, true, 1);
    const original = structuredClone(run);
    const explicit = castAngling(run, run.power);
    expect(explicit).toEqual(stepAngling(run, false, 1));
    expect(run).toEqual(original);
    expect(explicit.tick).toBe(run.tick + 1);
    expect(explicit.speciesId).toBe(run.power >= 55 ? 'SEA_BREAM' : 'MACKEREL');
    expect(explicit.precision).toBe(run.power >= 55 && run.power <= 80);
    expect(() => castAngling(explicit, 50)).toThrow();
    expect(() => castAngling(run, 100.5)).toThrow();
  }
});

it('keeps vertical aim separate from encounter pools and accepts both power boundaries', () => {
  for (const power of [0, 100]) {
    const a = initialAngling({
      mode: 'buttons',
      catBreed: 'RAGDOLL',
      spotId: 'POND',

      id: 'angling-1',
      catId: 'mochi',
      seed: 42,
      baitId: 'WORM',
      direction: -30,
      skillLevel: 1,
      aimDepth: 0,
    });
    const near = castAngling(a, power);
    const far = castAngling({ ...a, aimDepth: 100 }, power);
    expect({ ...far, aimDepth: 0 }).toEqual(near);
    const world = createWorld(42);
    world.dispatch({
      spotId: 'POND',

      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'WORM',
      direction: -30,
      aimDepth: power,
    });
    expect(
      world.dispatch({
        type: 'FISH_CAST',
        runId: world.getSnapshot().fishing.active!.id,
        power,
      }).ok,
    ).toBe(true);
    expect(world.getSnapshot().fishing.active!.power).toBe(power);
  }
});

it('gives identical core state when charged input is released or submitted as explicit power', () => {
  const world = createWorld(42);
  world.dispatch({
    spotId: 'POND',

    type: 'FISH_BEGIN',
    catId: 'mochi',
    baitId: 'WORM',
    direction: -30,
    aimDepth: 20,
  });
  const runId = world.getSnapshot().fishing.active!.id;
  for (let tick = 0; tick < 23; tick++)
    world.dispatch({ type: 'FISH_CONTROL', runId, pressed: true, ticks: 1 });
  const explicit = loadWorld(world.save());
  const power = world.getSnapshot().fishing.active!.power;
  expect(
    world.dispatch({ type: 'FISH_CONTROL', runId, pressed: false, ticks: 1 })
      .ok,
  ).toBe(true);
  expect(explicit.dispatch({ type: 'FISH_CAST', runId, power }).ok).toBe(true);
  expect(explicit.save()).toBe(world.save());
});
