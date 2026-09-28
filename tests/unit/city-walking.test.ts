import { expect, it } from 'vitest';
import { createWorld, loadWorld, World } from '../../src/core/world';

// Keep the route-cost cases on the central road; city-map.test covers the real spawn.
function centeredWorld(seed: number): World {
  const state = createWorld(seed).getSnapshot();
  state.cats[0]!.position = { x: 5, y: 5 };
  state.cats[0]!.fishingSpotId = null;
  return new World(state);
}

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
  expect(start.minute).toBe(0);
  expect(start.cats[0]!.position).toEqual({ x: 5, y: 5 });
  expect(start.cats[0]!.walk!.route).toHaveLength(2);
  expect(start.cats[0]!.walk!.nextStepMinute).toBe(5);
  world.advanceTime(4);
  expect(world.getSnapshot().cats[0]!.position).toEqual(
    start.cats[0]!.position,
  );
  world.advanceTime(1);
  expect(world.getSnapshot().cats[0]!.needs.energy).toBe(99);
  const restored = loadWorld(world.save());
  world.advanceTime(10);
  for (let n = 0; n < 10; n++) restored.advanceTime(1);
  expect(restored.save()).toBe(world.save());
  expect(world.getSnapshot().cats[0]).toMatchObject({
    position: { x: 6, y: 6 },
    needs: { energy: 98 },
    walk: null,
  });
  expect(world.getSnapshot().cats[1]!.needs.energy).toBe(100);
  const stopped = world.getSnapshot().cats[0]!.position;
  world.advanceTime(200);
  expect(world.getSnapshot().cats[0]!.position).toEqual(stopped);
});

it('stops exhausted cats and resumes their saved destination only after rest finishes', () => {
  const fixture = JSON.parse(centeredWorld(42).save());
  fixture.world.cats[0].needs.energy = 1;
  const world = loadWorld(JSON.stringify(fixture));
  world.dispatch({
    type: 'WALK_CAT',
    catId: 'mochi',
    destination: { x: 6, y: 6 },
  });
  world.advanceTime(5);
  const tired = world.getSnapshot().cats[0]!;
  expect(tired.needs.energy).toBe(0);
  expect(tired.walk!.nextStepMinute).toBeNull();
  world.advanceTime(20);
  expect(world.getSnapshot().cats[0]!.position).toEqual(tired.position);
  world.dispatch({ type: 'REST_CAT', catId: 'mochi' });
  world.advanceTime(60);
  expect(world.getSnapshot().cats[0]!.needs.energy).toBe(30);
  expect(world.getSnapshot().cats[0]!.position).toEqual(tired.position);
  expect(world.getSnapshot().cats[0]!.walk!.nextStepMinute).toBeGreaterThan(
    world.getSnapshot().minute,
  );
  world.advanceTime(10);
  expect(world.getSnapshot().cats[0]).toMatchObject({
    position: { x: 6, y: 6 },
    needs: { energy: 29 },
    walk: null,
  });
});

it('uses stone road timing and rejects water, occupied destinations and invalid inputs atomically', () => {
  const world = centeredWorld(42);
  const destination = { x: 6, y: 5 };
  world.dispatch({ type: 'UPGRADE_ROAD', position: destination });
  expect(
    world.dispatch({ type: 'WALK_CAT', catId: 'mochi', destination }).ok,
  ).toBe(true);
  expect(world.getSnapshot().cats[0]!.walk!.nextStepMinute).toBe(3);
  world.advanceTime(3);
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
  expect(world.getSnapshot().minute).toBe(0);
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
  world.advanceTime(120);
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
  const built = world.build({ x: 4, y: 4 });
  expect(built).toMatchObject({
    ok: true,
    events: expect.arrayContaining([
      { type: 'WalkBlocked', minute: 0, entityId: 'mochi' },
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
  world.advanceTime(5);
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
  expect(world.build(footprint).ok).toBe(true);
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
  tired.advanceTime(120);
  expect(tired.getSnapshot().cats[0]!.position).toEqual({ x: 3, y: 3 });
  expect(tired.getSnapshot().cats[0]!.needs.energy).toBeLessThan(20);
});
