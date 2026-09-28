import { advance, buildCafe } from '../helpers/world';
import { expect, it } from 'vitest';
import { CITY_COSTS, CITY_START } from '../../src/content/city';
import { assertWorld } from '../../src/core/schema';
import { createWorld } from '../../src/core/world';

const road = (world: ReturnType<typeof createWorld>, x: number, y: number) =>
  world.getSnapshot().map.tiles[y * CITY_START.size + x]!.road;

it('prices roads as a real decision next to land', () => {
  expect(CITY_COSTS.placeRoad).toBe(30);
  expect(CITY_COSTS.upgradeRoad).toBe(40);
  expect(CITY_COSTS.roadRefund).toEqual({ DIRT: 15, STONE: 35 });
});

it('removes an unused road with a partial refund, after which the tile can be built on', () => {
  const world = createWorld(42);
  const position = { x: 3, y: 5 };
  expect(road(world, 3, 5)).toBe('DIRT');
  expect(world.dispatch({ type: 'REMOVE_ROAD', position })).toEqual({
    ok: true,
    events: [{ type: 'CityChanged', minute: 0, action: 'REMOVE_ROAD' }],
  });
  expect(road(world, 3, 5)).toBeNull();
  expect(world.getSnapshot().coins).toBe(1000 + CITY_COSTS.roadRefund.DIRT);
  expect(buildCafe(world, position).ok).toBe(true);

  const stone = { x: 6, y: 5 };
  expect(world.dispatch({ type: 'UPGRADE_ROAD', position: stone }).ok).toBe(
    true,
  );
  const coins = world.getSnapshot().coins;
  expect(world.dispatch({ type: 'REMOVE_ROAD', position: stone }).ok).toBe(
    true,
  );
  expect(world.getSnapshot().coins).toBe(coins + CITY_COSTS.roadRefund.STONE);
});

it('rejects removals that break the road network or have nothing to remove, leaving the world unchanged', () => {
  const world = createWorld(42);
  expect(buildCafe(world, { x: 4, y: 4 }).ok).toBe(true);
  // The cafe touches two roads: one may go, the last connection may not.
  expect(
    world.dispatch({ type: 'REMOVE_ROAD', position: { x: 4, y: 5 } }).ok,
  ).toBe(true);
  const pond = world
    .getSnapshot()
    .map.tiles.find((tile) => tile.terrain === 'POND')!.position;
  const before = world.save();
  for (const [position, error] of [
    [{ x: 5, y: 4 }, 'ROAD_IN_USE'],
    [CITY_START.crossroads, 'ROAD_IN_USE'],
    [{ x: 3, y: 3 }, 'NO_ROAD'],
    [{ x: 4, y: 2 }, 'LAND_NOT_OWNED'],
    [pond, 'INVALID_PLACEMENT'],
  ] as const) {
    expect(world.dispatch({ type: 'REMOVE_ROAD', position })).toEqual({
      ok: false,
      error,
    });
    expect(world.save()).toBe(before);
  }
});

it('lets a road under a walking cat go: the route stays valid and the cat still arrives', () => {
  const world = createWorld(42);
  const destination = { x: 3, y: 5 };
  expect(
    world.dispatch({ type: 'WALK_CAT', catId: 'mochi', destination }).ok,
  ).toBe(true);
  const onRoute = world
    .getSnapshot()
    .cats[0]!.walk!.route.find(
      (position) =>
        road(world, position.x, position.y) &&
        (position.x !== CITY_START.crossroads.x ||
          position.y !== CITY_START.crossroads.y),
    )!;
  expect(onRoute).toBeDefined();
  expect(world.dispatch({ type: 'REMOVE_ROAD', position: onRoute }).ok).toBe(
    true,
  );
  expect(
    world.dispatch({ type: 'REMOVE_ROAD', position: destination }).ok,
  ).toBe(true);
  expect(() => assertWorld(world.getSnapshot())).not.toThrow();
  for (let step = 0; step < 30 && world.getSnapshot().cats[0]!.walk; step++)
    expect(advance(world, 10).ok).toBe(true);
  expect(world.getSnapshot().cats[0]!.position).toEqual(destination);
});
