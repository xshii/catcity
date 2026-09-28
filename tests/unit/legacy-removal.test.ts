import { buildCafe } from '../helpers/world';
import { expect, it } from 'vitest';
import { createWorld, loadWorld } from '../../src/core/world';

it('rejects removed choice-game and cafe-alias commands without changing the world', () => {
  const world = createWorld(42);
  const before = world.save();
  for (const command of [
    { type: 'START_FISHING', catId: 'mochi' },
    { type: 'CAST_LINE', runId: 'outing-1', spot: 0 },
    { type: 'CANCEL_FISHING', runId: 'outing-1' },
    { type: 'BUILD_CAFE', position: { x: 4, y: 4 } },
  ]) {
    expect(world.dispatch(command)).toEqual({
      ok: false,
      error: 'INVALID_COMMAND',
    });
    expect(world.save()).toBe(before);
  }
  expect(buildCafe(world, { x: 4, y: 4 }).ok).toBe(true);
  expect(world.getSnapshot().buildings[0]!.type).toBe('CAT_CAFE');
});

it('stores only the current fishing model and rejects legacy fields inside current saves', () => {
  const world = createWorld(42);
  expect(world.getSnapshot()).not.toHaveProperty('outings');
  expect(world.getSnapshot().cats[0]).not.toHaveProperty('keepsakes');
  for (const target of ['world', 'cat']) {
    const save = JSON.parse(world.save());
    if (target === 'world')
      save.world.outings = { active: null, completed: 0, lastResult: null };
    else save.world.cats[0].keepsakes = [];
    expect(() => loadWorld(JSON.stringify(save))).toThrow();
  }
});
