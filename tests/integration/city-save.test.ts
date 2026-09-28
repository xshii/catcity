import { advance, buildCafe } from '../helpers/world';
import { createTestSession } from '../helpers/session';
import { expect, it } from 'vitest';
import { createWorld, loadWorld } from '../../src/core';
import { replayWorld } from '../../harness/adapters/catcity/replay-world';

it('replays purchase, roads, road removal, building movement and partial walking across reload', () => {
  let saved: string | null = null;
  const session = createTestSession({
    repository: {
      read: () => saved,
      write: (next) => {
        saved = next;
      },
    },
  });
  for (const command of [
    { type: 'BUY_LAND', position: { x: 4, y: 2 } },
    { type: 'PLACE_ROAD', position: { x: 4, y: 3 } },
    {
      type: 'BUILD_BUILDING',
      buildingType: 'CAT_APARTMENT',
      position: { x: 4, y: 2 },
    },
    { type: 'ASSIGN_HOME', catId: 'mochi', buildingId: 'building-1' },
    { type: 'UPGRADE_ROAD', position: { x: 6, y: 5 } },
    { type: 'REMOVE_ROAD', position: { x: 3, y: 5 } },
    { type: 'WALK_CAT', catId: 'mochi', destination: { x: 6, y: 6 } },
    { type: 'ADVANCE_TIME', minutes: 4 },
  ] as const)
    expect(session.execute(command).ok).toBe(true);
  expect(session.getSnapshot().cats[0]!.walk).not.toBeNull();
  const restored = loadWorld(saved!);
  const command = { type: 'ADVANCE_TIME', minutes: 30 } as const;
  expect(session.execute(command)).toEqual(restored.dispatch(command));
  expect(restored.getSnapshot()).toEqual(session.getSnapshot());
  expect(replayWorld(session.getReplay())).toEqual(session.getSnapshot());
});

it('rejects malformed map, water occupancy, home capacity and impossible persisted routes', () => {
  const world = createWorld(42);
  world.dispatch({
    type: 'WALK_CAT',
    catId: 'mochi',
    destination: { x: 6, y: 6 },
  });
  type Fixture = ReturnType<typeof JSON.parse>;
  const changes = [
    (save: Fixture) => {
      save.world.map.tiles.reverse();
    },
    (save: Fixture) => {
      save.world.map.tiles[0].owned = true;
    },
    (save: Fixture) => {
      save.world.map.tiles[0].road = 'DIRT';
    },
    (save: Fixture) => {
      save.world.cats[0].position = { x: 0, y: 0 };
    },
    (save: Fixture) => {
      save.world.cats[0].walk.route = [{ x: 6, y: 6 }];
    },
    (save: Fixture) => {
      save.world.cats[0].walk.nextStepMinute = 0;
    },
    (save: Fixture) => {
      save.world.cats[0].walk.destination = { x: 3, y: 3 };
    },
    (save: Fixture) => {
      save.world.cats[0].walk.spotId = 'COAST';
    },
  ];
  for (const change of changes) {
    const save = JSON.parse(world.save());
    change(save);
    expect(() => loadWorld(JSON.stringify(save))).toThrow();
  }
  const home = createWorld(1);
  buildCafe(home, { x: 4, y: 4 });
  const badHome = JSON.parse(home.save());
  badHome.world.cats[0].home = 'building-1';
  expect(() => loadWorld(JSON.stringify(badHome))).toThrow();
});

it('rejects a forged active fishing away from a real shore and disconnected terrain', () => {
  const world = createWorld(42);
  world.dispatch({
    type: 'TRAVEL_TO_FISHING_SPOT',
    catId: 'mochi',
    spotId: 'POND',
  });
  advance(world, 120);
  world.dispatch({
    spotId: 'POND',
    aimDepth: 50,

    type: 'FISH_BEGIN',
    catId: 'mochi',
    baitId: 'BREAD',
    direction: 0,
  });
  const forged = JSON.parse(world.save());
  forged.world.cats[0].position = { x: 5, y: 5 };
  forged.world.cats[0].fishingSpotId = null;
  expect(() => loadWorld(JSON.stringify(forged))).toThrow();
  const island = JSON.parse(createWorld(42).save());
  for (const index of [8, 19]) island.world.map.tiles[index].terrain = 'SEA';
  expect(() => loadWorld(JSON.stringify(island))).toThrow();
});
