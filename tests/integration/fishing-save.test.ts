import { advance } from '../helpers/world';
import { fishingFixture as createWorld } from '../unit/fishing-fixture';
import { expect, it } from 'vitest';
import { loadWorld } from '../../src/core';

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
  fishing.world.cats[0].rest = { startedAt: 0 };
  expect(() => loadWorld(JSON.stringify(fishing))).toThrow('Invalid cat rest');
  world.dispatch({
    type: 'FISH_CANCEL',
    runId: world.getSnapshot().fishing.active!.id,
  });
  advance(world, 20);
  const idle = world.save();
  const future = JSON.parse(idle);
  future.world.cats[0].rest = { startedAt: 21 };
  expect(() => loadWorld(JSON.stringify(future))).toThrow('Invalid cat rest');
  // The end minute is derived; a stored v10 `until` field is rejected, not ignored.
  const legacyField = JSON.parse(idle);
  legacyField.world.cats[0].rest = { startedAt: 0, until: 60 };
  expect(() => loadWorld(JSON.stringify(legacyField))).toThrow();
  advance(world, 40);
  const finished = JSON.parse(world.save());
  finished.world.cats[0].rest = { startedAt: 0 };
  expect(() => loadWorld(JSON.stringify(finished))).toThrow('Invalid cat rest');
});
