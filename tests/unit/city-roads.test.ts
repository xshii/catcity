import { advance, buildCafe } from '../helpers/world';
import { expect, it } from 'vitest';
import { CITY_COSTS, CITY_START, ROAD_PRICE } from '../../src/content/city';
import { assertWorld } from '../../src/core/schema';
import { createWorld } from '../../src/core/world';

const road = (world: ReturnType<typeof createWorld>, x: number, y: number) =>
  world.getSnapshot().map.tiles[y * CITY_START.size + x]!.road;

it('prices roads as a real decision next to land', () => {
  expect(CITY_COSTS.placeRoad).toBe(30);
  expect(CITY_COSTS.upgradeRoad).toBe(40);
  // Removal refunds the full price paid for the surface.
  expect(ROAD_PRICE).toEqual({ DIRT: 30, STONE: 70 });
});

it('removes an unused road with a full refund, after which the tile can be built on', () => {
  const world = createWorld(42);
  const position = { x: 3, y: 5 };
  expect(road(world, 3, 5)).toBe('DIRT');
  expect(world.dispatch({ type: 'REMOVE_ROAD', position })).toEqual({
    ok: true,
    events: [{ type: 'CityChanged', minute: 0, action: 'REMOVE_ROAD' }],
  });
  expect(road(world, 3, 5)).toBeNull();
  expect(world.getSnapshot().coins).toBe(1000 + ROAD_PRICE.DIRT);
  expect(buildCafe(world, position).ok).toBe(true);

  const stone = { x: 6, y: 5 };
  expect(world.dispatch({ type: 'UPGRADE_ROAD', position: stone }).ok).toBe(
    true,
  );
  const coins = world.getSnapshot().coins;
  expect(world.dispatch({ type: 'REMOVE_ROAD', position: stone }).ok).toBe(
    true,
  );
  expect(world.getSnapshot().coins).toBe(coins + ROAD_PRICE.STONE);
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

it('never lays roads for a building: it must already touch the connected network', () => {
  const world = createWorld(42);
  const roads = () =>
    world
      .getSnapshot()
      .map.tiles.filter((tile) => tile.road)
      .map((tile) => tile.position);
  const before = roads();
  // (3,3) is owned land whose neighbours have no road.
  const initial = world.save();
  expect(buildCafe(world, { x: 3, y: 3 })).toEqual({
    ok: false,
    error: 'ROAD_NOT_CONNECTED',
  });
  expect(world.save()).toBe(initial);
  // A road on its own, cut off from the crossroads, does not count either.
  expect(
    world.dispatch({ type: 'BUY_LAND', position: { x: 4, y: 2 } }).ok,
  ).toBe(true);
  expect(
    world.dispatch({ type: 'PLACE_ROAD', position: { x: 4, y: 2 } }).ok,
  ).toBe(true);
  expect(
    world.dispatch({ type: 'BUY_LAND', position: { x: 3, y: 2 } }).ok,
  ).toBe(true);
  expect(buildCafe(world, { x: 3, y: 2 })).toEqual({
    ok: false,
    error: 'ROAD_NOT_CONNECTED',
  });
  // Next to the starter road the cafe is built and no road appears.
  const laid = roads();
  expect(buildCafe(world, { x: 4, y: 4 }).ok).toBe(true);
  expect(roads()).toEqual(laid);
  expect(laid).toHaveLength(before.length + 1);
  const cafe = world.getSnapshot().buildings[0]!.id;
  const placed = world.save();
  expect(
    world.dispatch({
      type: 'MOVE_BUILDING',
      buildingId: cafe,
      position: { x: 3, y: 3 },
    }),
  ).toEqual({ ok: false, error: 'ROAD_NOT_CONNECTED' });
  expect(world.save()).toBe(placed);
  expect(
    world.dispatch({
      type: 'MOVE_BUILDING',
      buildingId: cafe,
      position: { x: 6, y: 4 },
    }).ok,
  ).toBe(true);
  expect(roads()).toEqual(laid);
});

it('cannot turn building moves and road removal into coins', () => {
  // Review exploit: auto-laid roads used to be free and then refunded on removal.
  const world = createWorld(42);
  expect(buildCafe(world, { x: 4, y: 4 }).ok).toBe(true);
  const cafe = world.getSnapshot().buildings[0]!.id;
  const start = world.getSnapshot().coins;
  for (let round = 0; round < 5; round++) {
    world.dispatch({
      type: 'MOVE_BUILDING',
      buildingId: cafe,
      position: { x: 3, y: 3 },
    });
    world.dispatch({
      type: 'MOVE_BUILDING',
      buildingId: cafe,
      position: { x: 4, y: 4 },
    });
    for (const position of [
      { x: 4, y: 3 },
      { x: 3, y: 4 },
    ])
      world.dispatch({ type: 'REMOVE_ROAD', position });
  }
  expect(world.getSnapshot().coins).toBeLessThanOrEqual(start);
  // Laying a road and removing it again is exactly neutral.
  const position = { x: 3, y: 3 };
  const coins = world.getSnapshot().coins;
  expect(world.dispatch({ type: 'PLACE_ROAD', position }).ok).toBe(true);
  expect(world.dispatch({ type: 'UPGRADE_ROAD', position }).ok).toBe(true);
  expect(world.dispatch({ type: 'REMOVE_ROAD', position }).ok).toBe(true);
  expect(world.getSnapshot().coins).toBe(coins);
});
