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

it('rejects a stored rest: recovery is derived from the clock', () => {
  const save = JSON.parse(createWorld(42).save());
  save.world.cats[0].rest = { startedAt: 0 };
  expect(() => loadWorld(JSON.stringify(save))).toThrow();
});
