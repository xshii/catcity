import { expect, it } from 'vitest';
import { createWorld, loadWorld } from '../../src/core/world';
import legacySave from '../fixtures/save-v1.json';

it('continues to read the checked-in v1 save compatibility fixture', () => {
  const world = loadWorld(JSON.stringify(legacySave));
  expect(world.getSnapshot()).toMatchObject({
    minute: 79,
    coins: 710,
    seed: 42,
  });
  expect(world.getSnapshot().cats[0]!.memories[0]!.message).toBe('鱼');
  world.advanceTime(41);
  expect(world.getSnapshot().coins).toBe(720);
});

it('round-trips all state and deterministically continues movement, income and memories', () => {
  const original = createWorld(42);
  original.build({ x: 3, y: 3 });
  original.advanceTime(79);
  original.interact('mochi', '喜欢鱼吗？', '喜欢。');
  const restored = loadWorld(original.save());
  expect(restored.getSnapshot()).toEqual(original.getSnapshot());
  original.advanceTime(301);
  restored.advanceTime(301);
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
  world.build({ x: 0, y: 0 });
  world.interact('mochi', 'hi', 'hi');
  const save = JSON.parse(world.save());
  if (kind === 'negative-money') save.world.coins = -1;
  if (kind === 'overlap') save.world.cats[0].position = { x: 0, y: 0 };
  if (kind === 'out-of-bounds') save.world.cats[0].position.x = 10;
  if (kind === 'future-memory') save.world.cats[0].memories[0].minute = 100;
  if (kind === 'duplicate-cat') save.world.cats.push(save.world.cats[0]);
  expect(() => loadWorld(JSON.stringify(save))).toThrow();
});
