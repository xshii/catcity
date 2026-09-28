import { advance } from '../helpers/world';
import { createTestSession } from '../helpers/session';
import { fishingFixture as createWorld } from '../unit/fishing-fixture';
import { expect, it } from 'vitest';
import legacy from '../fixtures/save-v2.json';
import v4 from '../fixtures/save-v4.json';
import v5 from '../fixtures/save-v5.json';
import { createWorld as newCity, loadWorld } from '../../src/core';

it('rejects v2 demo saves instead of silently fabricating current data', () => {
  expect(() => loadWorld(JSON.stringify(legacy))).toThrow();
  expect(() => loadWorld(JSON.stringify(v4))).toThrow();
  expect(() => loadWorld(JSON.stringify(v5))).toThrow();
});

it('rejects corrupt new fishing saves and simultaneous incompatible activities', () => {
  const world = createWorld(42);
  world.dispatch({
    spotId: 'POND',
    aimDepth: 50,

    type: 'FISH_BEGIN',
    catId: 'mochi',
    baitId: 'BREAD',
    direction: 0,
  });
  const before = world.save();
  expect(
    world.dispatch({
      spotId: 'POND',
      aimDepth: 50,

      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'BREAD',
      direction: 0,
    }).ok,
  ).toBe(false);
  expect(world.save()).toBe(before);
  for (const changes of [
    { seed: 0 },
    { phase: 'caught' },
    { speciesId: 'SILVER' },
    { spotId: 'MOON' },
    { catId: 'ghost' },
  ]) {
    const save = JSON.parse(before);
    Object.assign(save.world.fishing.active, changes);
    expect(() => loadWorld(JSON.stringify(save))).toThrow();
  }
});

it('preserves an unsupported v3 save until the player explicitly resets the demo', async () => {
  const { default: v3 } = await import('../fixtures/save-v3.json');
  let data = JSON.stringify(v3);
  const original = data;
  const session = createTestSession({
    repository: {
      read: () => data,
      write: (value) => {
        data = value;
      },
    },
  });
  expect(session.storageError).not.toBeNull();
  session.execute({ type: 'ADVANCE_TIME', minutes: 60 });
  expect(data).toBe(original);
  session.resetDemo();
  expect(session.storageError).toBeNull();
  expect(JSON.parse(data).saveVersion).toBe(10);
  expect(loadWorld(data).getSnapshot()).toEqual(newCity(42).getSnapshot());
});

it('rejects impossible cat rest schedules and resting active fishing participants', () => {
  const world = createWorld(42);
  world.dispatch({
    spotId: 'POND',
    aimDepth: 50,

    type: 'FISH_BEGIN',
    catId: 'mochi',
    baitId: 'WORM',
    direction: 0,
  });
  const fishing = JSON.parse(world.save());
  fishing.world.cats[0].rest = { startedAt: 0, until: 60 };
  expect(() => loadWorld(JSON.stringify(fishing))).toThrow('Invalid cat rest');
  world.dispatch({
    type: 'FISH_CANCEL',
    runId: world.getSnapshot().fishing.active!.id,
  });
  advance(world, 20);
  const idle = world.save();
  for (const rest of [
    { startedAt: 21, until: 81 },
    { startedAt: 0, until: 20 },
    { startedAt: 0, until: 80 },
  ]) {
    const corrupt = JSON.parse(idle);
    corrupt.world.cats[0].rest = rest;
    expect(() => loadWorld(JSON.stringify(corrupt))).toThrow(
      'Invalid cat rest',
    );
  }
  advance(world, 40);
  const finished = JSON.parse(world.save());
  finished.world.cats[0].rest = { startedAt: 0, until: 60 };
  expect(() => loadWorld(JSON.stringify(finished))).toThrow('Invalid cat rest');
});
