import { SAVE_VERSION } from '../../src/core/schema';
import { advance, buildCafe, interact } from '../helpers/world';
import { expect, it } from 'vitest';
import { createWorld, loadWorld } from '../../src/core';

it('saves only facts: no RNG state, income remainder or recovery schedule', () => {
  const world = createWorld(42);
  buildCafe(world, { x: 4, y: 4 });
  advance(world, 25);
  world.dispatch({
    type: 'FISH_BEGIN',
    catId: 'mochi',
    baitId: 'BREAD',
    direction: 0,
    aimDepth: 50,
    spotId: 'POND',
  });
  const runId = world.getSnapshot().fishing.active!.id;
  // The cast spends stamina, so the cat has something to recover.
  world.dispatch({ type: 'FISH_CAST', runId, power: 50 });
  world.dispatch({ type: 'FISH_CANCEL', runId });
  const save = JSON.parse(world.save());
  expect(save.saveVersion).toBe(SAVE_VERSION);
  expect(save.world).not.toHaveProperty('rngState');
  expect(save.world.buildings[0]).not.toHaveProperty('incomeProgress');
  // Recovery follows from the clock and what the cat is doing; nothing is stored.
  expect(save.world.cats[0]).not.toHaveProperty('rest');
  // Write-only placeholders are not saved: no activity label, social need,
  // relationships, favourite places or daily routine.
  for (const field of [
    'currentActivity',
    'relationships',
    'favoritePlaces',
    'dailyRoutine',
  ])
    expect(save.world.cats[0]).not.toHaveProperty(field);
  expect(save.world.cats[0].needs).toEqual({ energy: 92 });
});

it('round-trips all state and deterministically continues movement, income and memories', () => {
  const original = createWorld(42);
  buildCafe(original, { x: 3, y: 3 });
  advance(original, 79);
  interact(original, 'mochi', '喜欢鱼吗？', '喜欢。');
  const restored = loadWorld(original.save());
  expect(restored.getSnapshot()).toEqual(original.getSnapshot());
  advance(original, 301);
  advance(restored, 301);
  expect(restored.getSnapshot()).toEqual(original.getSnapshot());
});

it.each(['not json', '{}', '{"saveVersion":999}'])(
  'rejects incompatible/corrupt saves: %s',
  (save) => {
    expect(() => loadWorld(save)).toThrow();
  },
);

it.each([
  'negative-money',
  'overlap',
  'out-of-bounds',
  'future-memory',
  'duplicate-cat',
])('rejects semantically impossible saves: %s', (kind) => {
  const world = createWorld(1);
  buildCafe(world, { x: 3, y: 3 });
  interact(world, 'mochi', 'hi', 'hi');
  const save = JSON.parse(world.save());
  if (kind === 'negative-money') save.world.coins = -1;
  if (kind === 'overlap') save.world.cats[0].position = { x: 3, y: 3 };
  if (kind === 'out-of-bounds') save.world.cats[0].position.x = 10;
  if (kind === 'future-memory')
    save.world.cats[0].memories[0].minute = save.world.minute + 1;
  if (kind === 'duplicate-cat') save.world.cats.push(save.world.cats[0]);
  expect(() => loadWorld(JSON.stringify(save))).toThrow();
});
