import { advance, buildCafe } from '../helpers/world';
import { expect, it } from 'vitest';
import { createWorld, loadWorld } from '../../src/core/world';

it('buys land before building, connects a cafe to dirt roads and preserves income when moving', () => {
  const world = createWorld(42);
  const land = world
    .getSnapshot()
    .map.tiles.find(
      (tile) =>
        tile.terrain === 'GRASS' &&
        !tile.owned &&
        tile.position.x === 4 &&
        tile.position.y === 2,
    )!;
  expect(land).toBeDefined();
  const initial = world.save();
  expect(
    world.dispatch({
      type: 'BUILD_BUILDING',
      buildingType: 'CAT_CAFE',
      position: land.position,
    }),
  ).toEqual({ ok: false, error: 'LAND_NOT_OWNED' });
  expect(world.save()).toBe(initial);
  expect(world.dispatch({ type: 'BUY_LAND', position: land.position }).ok).toBe(
    true,
  );
  expect(world.getSnapshot().coins).toBe(950);
  expect(
    world.dispatch({
      type: 'BUILD_BUILDING',
      buildingType: 'CAT_CAFE',
      position: land.position,
    }).ok,
  ).toBe(true);
  expect(world.getSnapshot().coins).toBe(650);
  expect(
    world
      .getSnapshot()
      .map.tiles.find((tile) => tile.position.x === 4 && tile.position.y === 3)!
      .road,
  ).toBe('DIRT');
  advance(world, 55);
  const building = world.getSnapshot().buildings[0]!;
  expect(
    world.dispatch({
      type: 'MOVE_BUILDING',
      buildingId: building.id,
      position: { x: 6, y: 4 },
    }).ok,
  ).toBe(true);
  expect(world.getSnapshot().buildings[0]).toMatchObject({
    id: building.id,
    builtAtMinute: 0,
    position: { x: 6, y: 4 },
  });
  expect(world.getSnapshot().coins).toBe(650);
  advance(world, 5);
  expect(world.getSnapshot().coins).toBe(660);
  expect(loadWorld(world.save()).save()).toBe(world.save());
});

it('rejects water ownership, occupied construction and unaffordable or disconnected builds atomically', () => {
  const world = createWorld(42);
  const water = world
    .getSnapshot()
    .map.tiles.find((tile) => tile.terrain !== 'GRASS')!;
  const initial = world.save();
  for (const command of [
    { type: 'BUY_LAND', position: water.position },
    {
      type: 'BUILD_BUILDING',
      buildingType: 'CAT_APARTMENT',
      position: { x: 5, y: 5 },
    },
    { type: 'BUY_LAND', position: { x: 4, y: 4 } },
    {
      type: 'BUILD_BUILDING',
      buildingType: 'UNKNOWN',
      position: { x: 4, y: 4 },
    },
  ]) {
    expect(world.dispatch(command).ok).toBe(false);
    expect(world.save()).toBe(initial);
  }
  const fixture = JSON.parse(world.save());
  fixture.world.coins = 299;
  const poor = loadWorld(JSON.stringify(fixture));
  const poorBefore = poor.save();
  expect(buildCafe(poor, { x: 4, y: 4 })).toEqual({
    ok: false,
    error: 'INSUFFICIENT_COINS',
  });
  expect(poor.save()).toBe(poorBefore);
  const remote = world
    .getSnapshot()
    .map.tiles.find(
      (tile) =>
        tile.terrain === 'GRASS' &&
        !tile.owned &&
        tile.position.x >= 8 &&
        tile.position.y <= 1,
    )!;
  expect(
    world.dispatch({ type: 'BUY_LAND', position: remote.position }).ok,
  ).toBe(true);
  const disconnected = world.save();
  expect(
    world.dispatch({
      type: 'BUILD_BUILDING',
      buildingType: 'CAT_CAFE',
      position: remote.position,
    }),
  ).toEqual({ ok: false, error: 'ROAD_NOT_CONNECTED' });
  expect(world.save()).toBe(disconnected);
});

it('gives apartments two homes and recovery only to assigned cats resting beside home', () => {
  const world = createWorld(42);
  expect(
    world.dispatch({
      type: 'BUILD_BUILDING',
      buildingType: 'CAT_APARTMENT',
      position: { x: 4, y: 4 },
    }).ok,
  ).toBe(true);
  const home = world.getSnapshot().buildings[0]!;
  world.dispatch({ type: 'DEBUG_SPAWN_CAT', position: { x: 4, y: 5 } });
  world.dispatch({ type: 'DEBUG_SPAWN_CAT', position: { x: 6, y: 6 } });
  const cats = world.getSnapshot().cats;
  expect(
    world.dispatch({ type: 'ASSIGN_HOME', catId: 'mochi', buildingId: home.id })
      .ok,
  ).toBe(true);
  expect(
    world.dispatch({
      type: 'ASSIGN_HOME',
      catId: cats[1]!.id,
      buildingId: home.id,
    }).ok,
  ).toBe(true);
  const occupied = world.save();
  expect(
    world.dispatch({
      type: 'ASSIGN_HOME',
      catId: cats[2]!.id,
      buildingId: home.id,
    }),
  ).toEqual({ ok: false, error: 'HOME_FULL' });
  expect(world.save()).toBe(occupied);
  const fixture = JSON.parse(world.save());
  for (const cat of fixture.world.cats) cat.needs.energy = 40;
  const resting = loadWorld(JSON.stringify(fixture));
  for (const cat of resting.getSnapshot().cats)
    resting.dispatch({ type: 'REST_CAT', catId: cat.id });
  advance(resting, 10);
  expect(resting.getSnapshot().cats.map((cat) => cat.needs.energy)).toEqual([
    45, 50, 45,
  ]);
  expect(resting.getSnapshot().coins).toBe(750);
});

it('lays and upgrades owned roads once, with no world mutation on rejected repeats', () => {
  const world = createWorld(42);
  const position = { x: 3, y: 3 };
  expect(world.dispatch({ type: 'PLACE_ROAD', position }).ok).toBe(true);
  expect(world.getSnapshot().coins).toBe(990);
  expect(world.dispatch({ type: 'UPGRADE_ROAD', position }).ok).toBe(true);
  expect(world.getSnapshot().coins).toBe(970);
  const before = world.save();
  for (const command of [
    { type: 'PLACE_ROAD', position },
    { type: 'UPGRADE_ROAD', position },
  ]) {
    expect(world.dispatch(command).ok).toBe(false);
    expect(world.save()).toBe(before);
  }
});

it('pays cafe income per instance and moves only into valid owned connected land', () => {
  const world = createWorld(42);
  buildCafe(world, { x: 4, y: 4 });
  buildCafe(world, { x: 6, y: 4 });
  expect(world.getSnapshot().coins).toBe(400);
  advance(world, 60);
  expect(world.getSnapshot().coins).toBe(420);
  const first = world.getSnapshot().buildings[0]!;
  const before = world.save();
  for (const position of [
    { x: 6, y: 4 },
    { x: 5, y: 5 },
    { x: 0, y: 0 },
    { x: 9, y: 0 },
  ]) {
    expect(
      world.dispatch({ type: 'MOVE_BUILDING', buildingId: first.id, position })
        .ok,
    ).toBe(false);
    expect(world.save()).toBe(before);
  }
});
