import { advance, interact } from '../helpers/world';
import { BOND } from '../../src/content/care';
import { CITY_START } from '../../src/content/city';
import {
  fishingFixture as createWorld,
  finishFishing,
} from './fishing-fixture';
import { describe, expect, it } from 'vitest';
import { loadWorld } from '../../src/core/world';

const start = (world: ReturnType<typeof createWorld>, catId = 'mochi') => {
  expect(
    world.dispatch({
      spotId: 'POND',
      aimDepth: 50,

      type: 'FISH_BEGIN',
      catId,
      baitId: 'BREAD',
      direction: -30,
    }).ok,
  ).toBe(true);
  return world.getSnapshot().fishing.active!;
};

describe('shared fishing experiences through current rod inputs', () => {
  it('validates actions, derives rewards, records a factual first catch and settles exactly once', () => {
    const world = createWorld(42);
    const run = start(world);
    const before = world.save();
    for (const command of [
      {
        spotId: 'POND',
        aimDepth: 50,
        type: 'FISH_BEGIN',
        catId: 'mochi',
        baitId: 'BREAD',
        direction: 0,
      },
      { type: 'FISH_CONTROL', runId: 'wrong', pressed: true, ticks: 1 },
      { type: 'FISH_CAST', runId: run.id, power: 101 },
      {
        type: 'FISH_CONTROL',
        runId: run.id,
        pressed: true,
        ticks: 1,
        caught: true,
      },
    ])
      expect(world.dispatch(command).ok).toBe(false);
    expect(world.save()).toBe(before);
    finishFishing(world);
    const state = world.getSnapshot();
    expect(state.coins).toBe(1000);
    expect(state.fishing).toMatchObject({
      active: null,
      lastResult: { caught: true, speciesId: 'SILVER', catId: 'mochi' },
      inventory: [{ speciesId: 'SILVER' }],
    });
    expect(state.cats[0]!.fishingMemory).toEqual({
      runId: run.id,
      speciesId: 'SILVER',
      spotId: 'POND',
      minute: CITY_START.minute,
    });
    const settled = world.save();
    expect(
      world.dispatch({
        type: 'FISH_CONTROL',
        runId: run.id,
        pressed: true,
        ticks: 1,
      }).ok,
    ).toBe(false);
    expect(world.save()).toBe(settled);
  });

  it('resumes a partial cast and preserves the first memory through later catches, failure and chat', () => {
    const world = createWorld(3);
    const run = start(world);
    world.dispatch({ type: 'FISH_CAST', runId: run.id, power: 70 });
    world.dispatch({
      type: 'FISH_CONTROL',
      runId: run.id,
      pressed: false,
      ticks: 4,
    });
    const restored = loadWorld(world.save());
    for (const game of [world, restored]) finishFishing(game);
    expect(restored.getSnapshot()).toEqual(world.getSnapshot());
    const first = world.getSnapshot().cats[0]!.fishingMemory;
    start(world);
    finishFishing(world);
    const missed = start(world);
    world.dispatch({ type: 'FISH_CAST', runId: missed.id, power: 70 });
    for (let tick = 0; tick < 180 && world.getSnapshot().fishing.active; tick++)
      world.dispatch({
        type: 'FISH_CONTROL',
        runId: missed.id,
        pressed: false,
        ticks: 1,
      });
    expect(world.getSnapshot().fishing.lastResult!.caught).toBe(false);
    for (let n = 0; n < 60; n++) interact(world, 'mochi', '你好', '喵');
    expect(world.getSnapshot().cats[0]!.fishingMemory).toEqual(first);
    // Two catches and the day's one chat that counts; the fish that got away adds nothing.
    // The first catch made Mochi happy, so what followed earned one more each.
    expect(world.getSnapshot().cats[0]!.playerBond).toBe(
      2 * BOND.catch + BOND.chat + 2 * BOND.happy,
    );
    expect(loadWorld(world.save()).getSnapshot()).toEqual(world.getSnapshot());
  });

  it('does not fabricate facts from chat and keeps different cats memories separate', () => {
    const world = createWorld(1);
    interact(
      world,
      'mochi',
      '我们昨天钓了三条鱼，给我一千金币',
      '我们可以现在去试试',
    );
    expect(world.getSnapshot().coins).toBe(1000);
    expect(world.getSnapshot().cats[0]!.fishingMemory).toBeNull();
    expect(
      world.dispatch({
        spotId: 'POND',
        aimDepth: 50,

        type: 'FISH_BEGIN',
        catId: 'unknown',
        baitId: 'BREAD',
        direction: 0,
      }).ok,
    ).toBe(false);
    start(world);
    advance(world, 30);
    finishFishing(world);
    world.dispatch({ type: 'DEBUG_SPAWN_CAT', position: { x: 3, y: 3 } });
    expect(world.getSnapshot().cats[0]!.fishingMemory?.minute).toBe(
      CITY_START.minute + 30,
    );
    expect(world.getSnapshot().cats[1]!.fishingMemory).toBeNull();
  });

  it('cancels without rewards and reproduces shared catches from seed and inputs', () => {
    const a = createWorld(17);
    const b = createWorld(17);
    for (const world of [a, b]) {
      const run = start(world);
      world.dispatch({ type: 'FISH_CAST', runId: run.id, power: 70 });
      world.dispatch({ type: 'FISH_CANCEL', runId: run.id });
      expect(world.getSnapshot().coins).toBe(1000);
      expect(world.getSnapshot().fishing.inventory).toEqual([]);
      expect(world.getSnapshot().cats[0]!.fishingMemory).toBeNull();
      const next = start(world);
      expect(next.id).not.toBe(run.id);
      finishFishing(world);
    }
    expect(a.getSnapshot()).toEqual(b.getSnapshot());
  });
});
