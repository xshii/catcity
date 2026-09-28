import { advance, buildCafe } from '../helpers/world';
import { fishingFixture as createWorld, catsAtPond } from './fishing-fixture';
import { expect, it } from 'vitest';
import { loadWorld } from '../../src/core/world';

it('charges only the fishing cat and restores only a resting cat on the shared clock', () => {
  let world = createWorld(42);
  buildCafe(world, { x: 4, y: 4 });
  world.dispatch({ type: 'INVITE_PEPPER' });
  world = catsAtPond(world);
  const pepper = world.getSnapshot().cats[1]!;
  for (const catId of ['mochi', pepper.id]) {
    world.dispatch({
      spotId: 'POND',
      aimDepth: 50,

      type: 'FISH_BEGIN',
      catId,
      baitId: 'BREAD',
      direction: 0,
    });
    const runId = world.getSnapshot().fishing.active!.id;
    // Casting is what costs stamina; preparing is free.
    world.dispatch({ type: 'FISH_CAST', runId, power: 50 });
    world.dispatch({ type: 'FISH_CANCEL', runId });
  }
  expect(world.getSnapshot().cats.map((cat) => cat.needs.energy)).toEqual([
    92, 92,
  ]);
  advance(world, 7);
  expect(world.dispatch({ type: 'REST_CAT', catId: 'mochi' }).ok).toBe(true);
  expect(world.getSnapshot().minute).toBe(7);
  const before = world.save();
  expect(
    world.dispatch({
      spotId: 'POND',
      aimDepth: 50,

      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'BREAD',
      direction: 0,
    }),
  ).toEqual({ ok: false, error: 'CAT_RESTING' });
  expect(world.save()).toBe(before);
  advance(world, 9);
  expect(world.getSnapshot().cats[0]!.needs.energy).toBe(92);
  advance(world, 1);
  expect(world.getSnapshot().cats.map((cat) => cat.needs.energy)).toEqual([
    97, 92,
  ]);
  const restored = loadWorld(world.save());
  advance(world, 50);
  for (let n = 0; n < 50; n++) advance(restored, 1);
  expect(restored.getSnapshot()).toEqual(world.getSnapshot());
  expect(world.getSnapshot().cats.map((cat) => cat.needs.energy)).toEqual([
    100, 92,
  ]);
  expect(world.getSnapshot().cats[0]!.rest).toBeNull();
  expect(world.getSnapshot().coins).toBe(710);
});

it('allows another cat to fish while a companion rests; rejects invalid and duplicate rest commands', () => {
  let world = createWorld(2);
  world.dispatch({ type: 'INVITE_PEPPER' });
  world = catsAtPond(world);
  const fixture = JSON.parse(world.save());
  fixture.world.cats[0].needs.energy = 40;
  const game = loadWorld(JSON.stringify(fixture));
  const before = game.save();
  for (const catId of ['missing', game.getSnapshot().cats[1]!.id]) {
    expect(game.dispatch({ type: 'REST_CAT', catId }).ok).toBe(false);
    expect(game.save()).toBe(before);
  }
  game.dispatch({ type: 'REST_CAT', catId: 'mochi' });
  const resting = game.save();
  expect(game.dispatch({ type: 'REST_CAT', catId: 'mochi' }).ok).toBe(false);
  expect(game.save()).toBe(resting);
  const pepper = game.getSnapshot().cats[1]!;
  expect(
    game.dispatch({
      spotId: 'POND',
      aimDepth: 50,

      type: 'FISH_BEGIN',
      catId: pepper.id,
      baitId: 'BREAD',
      direction: 0,
    }).ok,
  ).toBe(true);
  const fishing = game.save();
  expect(game.dispatch({ type: 'REST_CAT', catId: pepper.id }).ok).toBe(false);
  expect(game.save()).toBe(fishing);
  advance(game, 60);
  // Pepper is still preparing: nothing is paid until the cast.
  expect(game.getSnapshot().cats.map((cat) => cat.needs.energy)).toEqual([
    70, 100,
  ]);
  const corrupt = JSON.parse(game.save());
  corrupt.world.cats[0].rest = { startedAt: 0, until: 600 };
  expect(() => loadWorld(JSON.stringify(corrupt))).toThrow();
});

it('feeds canned food to the specified cat only, with atomic rejection and no shared stamina pool', () => {
  const fixture = JSON.parse(createWorld(8).save());
  fixture.world.cats[0].needs.energy = 30;
  fixture.world.fishing.supplies.cans = 1;
  let world = loadWorld(JSON.stringify(fixture));
  world.dispatch({ type: 'INVITE_PEPPER' });
  world = catsAtPond(world);
  const before = world.save();
  expect(world.dispatch({ type: 'USE_CAN', catId: 'missing' }).ok).toBe(false);
  expect(world.save()).toBe(before);
  expect(world.dispatch({ type: 'USE_CAN', catId: 'mochi' }).ok).toBe(true);
  expect(world.getSnapshot().cats.map((cat) => cat.needs.energy)).toEqual([
    50, 100,
  ]);
  expect(world.getSnapshot().fishing).not.toHaveProperty('stamina');
  const used = world.save();
  expect(world.dispatch({ type: 'USE_CAN', catId: 'mochi' }).ok).toBe(false);
  expect(world.save()).toBe(used);
});

it('keeps fishing input ticks separate from the shared clock and stops recovery at rest completion', () => {
  const fixture = JSON.parse(createWorld(42).save());
  fixture.world.cats[0].needs.energy = 20;
  let world = loadWorld(JSON.stringify(fixture));
  world.dispatch({ type: 'INVITE_PEPPER' });
  world = catsAtPond(world);
  world.dispatch({ type: 'REST_CAT', catId: 'mochi' });
  const pepper = world.getSnapshot().cats[1]!;
  world.dispatch({
    spotId: 'POND',
    aimDepth: 50,

    type: 'FISH_BEGIN',
    catId: pepper.id,
    baitId: 'BREAD',
    direction: 0,
  });
  const runId = world.getSnapshot().fishing.active!.id;
  for (let tick = 0; tick < 40; tick++)
    world.dispatch({ type: 'FISH_CONTROL', runId, pressed: true, ticks: 4 });
  expect(world.getSnapshot().minute).toBe(0);
  expect(world.getSnapshot().cats[0]!.needs.energy).toBe(20);
  advance(world, 59);
  expect(world.getSnapshot().cats[0]!.needs.energy).toBe(45);
  expect(world.getSnapshot().cats[0]!.rest).not.toBeNull();
  const result = advance(world, 1);
  expect(result).toMatchObject({
    ok: true,
    events: expect.arrayContaining([
      { type: 'CatRestFinished', minute: 60, entityId: 'mochi' },
    ]),
  });
  expect(world.getSnapshot().cats[0]!.rest).toBeNull();
  advance(world, 60);
  // Pepper is still charging: nothing is paid until the cast.
  expect(world.getSnapshot().cats.map((cat) => cat.needs.energy)).toEqual([
    50, 100,
  ]);
});

it('rejects an unfinishable rest at the clock limit without changing cat energy or state', () => {
  const fixture = JSON.parse(createWorld(1).save());
  fixture.world.minute = 1_000_000_000 - 59;
  fixture.world.cats[0].needs.energy = 50;
  const world = loadWorld(JSON.stringify(fixture));
  const before = world.save();
  expect(world.dispatch({ type: 'REST_CAT', catId: 'mochi' })).toEqual({
    ok: false,
    error: 'TIME_LIMIT',
  });
  expect(world.save()).toBe(before);
  fixture.world.minute--;
  const boundary = loadWorld(JSON.stringify(fixture));
  expect(boundary.dispatch({ type: 'REST_CAT', catId: 'mochi' }).ok).toBe(true);
  expect(advance(boundary, 60).ok).toBe(true);
  expect(boundary.getSnapshot().cats[0]!.needs.energy).toBe(80);
  expect(boundary.getSnapshot().cats[0]!.rest).toBeNull();
});

it('reports energy recovery only when energy actually rises', () => {
  const world = createWorld(42);
  world.dispatch({
    type: 'FISH_BEGIN',
    catId: 'mochi',
    spotId: 'POND',
    baitId: 'BREAD',
    direction: 0,
    aimDepth: 50,
  });
  const runId = world.getSnapshot().fishing.active!.id;
  world.dispatch({ type: 'FISH_CAST', runId, power: 50 });
  world.dispatch({ type: 'FISH_CANCEL', runId });
  expect(world.getSnapshot().cats[0]!.needs.energy).toBe(92);
  expect(world.dispatch({ type: 'REST_CAT', catId: 'mochi' }).ok).toBe(true);
  const result = world.dispatch({ type: 'ADVANCE_TIME', minutes: 60 });
  if (!result.ok) throw new Error(result.error);
  // 92 → 97 → 100; the remaining rest ticks change nothing and stay silent.
  expect(
    result.events.filter((event) => event.type === 'EnergyRecovered'),
  ).toHaveLength(2);
  expect(world.getSnapshot().cats[0]!.needs.energy).toBe(100);
});
