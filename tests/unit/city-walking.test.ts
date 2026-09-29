import { CARE } from '../../src/content/care';
import { CITY_START, WALK_MINUTES } from '../../src/content/city';
import { advance, buildCafe } from '../helpers/world';
import { expect, it } from 'vitest';
import { walkMinutes } from '../../src/core/city';
import { createWorld, loadWorld, World } from '../../src/core/world';

// Keep the route-cost cases on the central road; city-map.test covers the real spawn.
function centeredWorld(seed: number): World {
  const state = createWorld(seed).getSnapshot();
  state.cats[0]!.position = { x: 5, y: 5 };
  state.cats[0]!.fishingSpotId = null;
  return new World(state);
}

it('walks a tile of grass in 6 game minutes, of dirt road in 3 and of stone road in 2', () => {
  expect(WALK_MINUTES).toEqual({ GRASS: 6, DIRT: 3, STONE: 2 });
});

it('moves one real tile per scheduled step, charges only that cat and persists the route', () => {
  const world = centeredWorld(42);
  world.dispatch({ type: 'DEBUG_SPAWN_CAT', position: { x: 3, y: 3 } });
  expect(
    world.dispatch({
      type: 'WALK_CAT',
      catId: 'mochi',
      destination: { x: 6, y: 6 },
    }).ok,
  ).toBe(true);
  const start = world.getSnapshot();
  expect(start.minute).toBe(CITY_START.minute);
  expect(start.cats[0]!.position).toEqual({ x: 5, y: 5 });
  expect(start.cats[0]!.walk!.route).toHaveLength(2);
  expect(start.cats[0]!.walk!.nextStepMinute).toBe(
    start.minute + WALK_MINUTES.DIRT,
  );
  advance(world, WALK_MINUTES.DIRT - 1);
  expect(world.getSnapshot().cats[0]!.position).toEqual(
    start.cats[0]!.position,
  );
  advance(world, 1);
  expect(world.getSnapshot().cats[0]!.needs.energy).toBe(99);
  const restored = loadWorld(world.save());
  // The second tile is grass; stopping there keeps the idle recovery tick out of the sum.
  advance(world, WALK_MINUTES.GRASS);
  for (let n = 0; n < WALK_MINUTES.GRASS; n++) advance(restored, 1);
  expect(restored.save()).toBe(world.save());
  expect(world.getSnapshot().cats[0]).toMatchObject({
    position: { x: 6, y: 6 },
    needs: { energy: 98 },
    walk: null,
  });
  expect(world.getSnapshot().cats[1]!.needs.energy).toBe(100);
  const stopped = world.getSnapshot().cats[0]!.position;
  advance(world, 200);
  expect(world.getSnapshot().cats[0]!.position).toEqual(stopped);
});

it('stops exhausted cats, which recover by themselves and resume their saved destination', () => {
  const fixture = JSON.parse(centeredWorld(42).save());
  fixture.world.cats[0].needs.energy = 1;
  const world = loadWorld(JSON.stringify(fixture));
  world.dispatch({
    type: 'WALK_CAT',
    catId: 'mochi',
    destination: { x: 6, y: 6 },
  });
  advance(world, WALK_MINUTES.DIRT);
  const tired = world.getSnapshot().cats[0]!;
  expect(tired.needs.energy).toBe(0);
  expect(tired.walk!.nextStepMinute).toBeNull();
  advance(world, CARE.recovery.tickMinutes - WALK_MINUTES.DIRT - 1);
  expect(world.getSnapshot().cats[0]!.position).toEqual(tired.position);
  // The stopped cat is idle: the next recovery tick lets it go on.
  advance(world, 1);
  const recovered = world.getSnapshot().cats[0]!;
  expect(recovered.needs.energy).toBe(CARE.recovery.idle);
  expect(recovered.position).toEqual(tired.position);
  expect(recovered.walk!.nextStepMinute).toBeGreaterThan(
    world.getSnapshot().minute,
  );
  const left = recovered.walk!.route.length;
  advance(world, 120);
  expect(world.getSnapshot().cats[0]).toMatchObject({
    position: { x: 6, y: 6 },
    walk: null,
  });
  // One energy per tile; a walking cat does not recover, an idle one does again.
  expect(left).toBeLessThanOrEqual(CARE.recovery.idle);
});

it('uses stone road timing and rejects water, occupied destinations and invalid inputs atomically', () => {
  const world = centeredWorld(42);
  const destination = { x: 6, y: 5 };
  world.dispatch({ type: 'UPGRADE_ROAD', position: destination });
  expect(
    world.dispatch({ type: 'WALK_CAT', catId: 'mochi', destination }).ok,
  ).toBe(true);
  expect(world.getSnapshot().cats[0]!.walk!.nextStepMinute).toBe(
    CITY_START.minute + WALK_MINUTES.STONE,
  );
  advance(world, WALK_MINUTES.STONE);
  expect(world.getSnapshot().cats[0]!.position).toEqual(destination);
  const water = world
    .getSnapshot()
    .map.tiles.find((tile) => tile.terrain !== 'GRASS')!;
  const before = world.save();
  for (const command of [
    { type: 'WALK_CAT', catId: 'mochi', destination: water.position },
    { type: 'WALK_CAT', catId: 'ghost', destination: { x: 4, y: 5 } },
    { type: 'WALK_CAT', catId: 'mochi', destination: { x: 10, y: 5 } },
  ]) {
    expect(world.dispatch(command).ok).toBe(false);
    expect(world.save()).toBe(before);
  }
});

it('requires actually reaching a shore before fishing and keeps locked travel atomic', () => {
  const world = centeredWorld(42);
  expect(world.getSnapshot().cats[0]!.fishingSpotId).toBeNull();
  const initial = world.save();
  expect(
    world.dispatch({
      aimDepth: 50,

      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'BREAD',
      direction: 0,
      spotId: 'POND',
    }),
  ).toEqual({ ok: false, error: 'TRAVEL_REQUIRED' });
  expect(
    world.dispatch({ type: 'FISH_CAST', runId: 'angling-1', power: 70 }),
  ).toEqual({
    ok: false,
    error: 'RUN_NOT_FOUND',
  });
  expect(
    world.dispatch({
      type: 'TRAVEL_TO_FISHING_SPOT',
      catId: 'mochi',
      spotId: 'COAST',
    }),
  ).toEqual({ ok: false, error: 'SPOT_LOCKED' });
  expect(world.save()).toBe(initial);
  expect(
    world.dispatch({
      type: 'TRAVEL_TO_FISHING_SPOT',
      catId: 'mochi',
      spotId: 'POND',
    }).ok,
  ).toBe(true);
  expect(world.getSnapshot().minute).toBe(CITY_START.minute);
  expect(world.getSnapshot().cats[0]!.walk).not.toBeNull();
  expect(
    world.dispatch({
      aimDepth: 50,

      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'BREAD',
      direction: 0,
      spotId: 'POND',
    }).ok,
  ).toBe(false);
  advance(world, 120);
  expect(world.getSnapshot().cats[0]!.walk).toBeNull();
  expect(world.getSnapshot().cats[0]!.fishingSpotId).toBe('POND');
  expect(
    world.dispatch({
      aimDepth: 50,

      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'BREAD',
      direction: 0,
      spotId: 'POND',
    }).ok,
  ).toBe(true);
});

it('stops blocked destinations after building and keeps competing walkers separate', () => {
  const world = centeredWorld(42);
  expect(
    world.dispatch({
      type: 'WALK_CAT',
      catId: 'mochi',
      destination: { x: 4, y: 4 },
    }).ok,
  ).toBe(true);
  const built = buildCafe(world, { x: 4, y: 4 });
  expect(built).toMatchObject({
    ok: true,
    events: expect.arrayContaining([
      { type: 'WalkBlocked', minute: CITY_START.minute, entityId: 'mochi' },
    ]),
  });
  expect(world.getSnapshot().cats[0]!.walk).toBeNull();
  world.dispatch({ type: 'DEBUG_SPAWN_CAT', position: { x: 6, y: 6 } });
  const other = world.getSnapshot().cats[1]!;
  for (const catId of ['mochi', other.id])
    expect(
      world.dispatch({ type: 'WALK_CAT', catId, destination: { x: 6, y: 5 } })
        .ok,
    ).toBe(true);
  advance(world, WALK_MINUTES.DIRT);
  const cats = world.getSnapshot().cats;
  expect(cats[0]!.position).toEqual({ x: 6, y: 5 });
  expect(cats[1]!.position).toEqual({ x: 6, y: 6 });
  expect(cats.map((cat) => cat.needs.energy)).toEqual([99, 100]);
  expect(cats[1]!.walk).toBeNull();
  expect(loadWorld(world.save()).getSnapshot()).toEqual(world.getSnapshot());
});

it('replans routes around construction and resumes an exhausted route using canned food', () => {
  const world = centeredWorld(42);
  world.dispatch({
    type: 'WALK_CAT',
    catId: 'mochi',
    destination: { x: 3, y: 3 },
  });
  const original = world.getSnapshot().cats[0]!.walk!.route;
  const footprint = original.find(
    (position) =>
      world.getSnapshot().map.tiles[position.y * 10 + position.x]!.road ===
        null && !(position.x === 3 && position.y === 3),
  )!;
  expect(footprint).toBeDefined();
  expect(buildCafe(world, footprint).ok).toBe(true);
  expect(world.getSnapshot().cats[0]!.walk!.route).not.toContainEqual(
    footprint,
  );
  const save = JSON.parse(world.save());
  save.world.cats[0].needs.energy = 0;
  save.world.cats[0].walk.nextStepMinute = null;
  save.world.fishing.supplies.cans = 1;
  const tired = loadWorld(JSON.stringify(save));
  expect(tired.dispatch({ type: 'USE_CAN', catId: 'mochi' }).ok).toBe(true);
  expect(tired.getSnapshot().cats[0]!.walk!.nextStepMinute).toBeGreaterThan(
    tired.getSnapshot().minute,
  );
  // Arriving has cost energy; an idle cat would start recovering after that.
  for (
    let minute = 0;
    minute < 120 && tired.getSnapshot().cats[0]!.walk;
    minute++
  )
    advance(tired, 1);
  expect(tired.getSnapshot().cats[0]!.position).toEqual({ x: 3, y: 3 });
  expect(tired.getSnapshot().cats[0]!.needs.energy).toBeLessThan(20);
});

it('tells how long a walk takes before it is ordered, from the route Core then queues', () => {
  const world = centeredWorld(42);
  const destination = { x: 6, y: 6 };
  const before = world.save();
  const minutes = walkMinutes(world.getSnapshot(), 'mochi', destination);
  expect(minutes).toBe(WALK_MINUTES.DIRT + WALK_MINUTES.GRASS);
  expect(world.save()).toBe(before);
  world.dispatch({ type: 'WALK_CAT', catId: 'mochi', destination });
  advance(world, minutes! - 1);
  expect(world.getSnapshot().cats[0]!.walk).not.toBeNull();
  advance(world, 1);
  expect(world.getSnapshot().cats[0]).toMatchObject({
    position: destination,
    walk: null,
  });
  // No route: water, a missing cat, the tile the cat stands on.
  const water = world
    .getSnapshot()
    .map.tiles.find((tile) => tile.terrain !== 'GRASS')!;
  const state = world.getSnapshot();
  expect(walkMinutes(state, 'mochi', water.position)).toBeNull();
  expect(walkMinutes(state, 'ghost', { x: 4, y: 5 })).toBeNull();
  expect(walkMinutes(state, 'mochi', destination)).toBeNull();
});
