import { expect, it } from 'vitest';
import { createWorld, loadWorld, type GameCommand } from '../../src/core';
import { greenZone, motionTarget } from '../../src/minigames/angling';
import { replayWorld } from '../../harness/adapters/catcity/replay-world';
import { createTestSession } from '../helpers/session';
import { fishingFixture } from '../unit/fishing-fixture';

function partialHook() {
  const world = fishingFixture(42);
  world.dispatch({
    type: 'FISH_BEGIN',
    catId: 'mochi',
    baitId: 'WORM',
    direction: 0,
    aimDepth: 50,
    spotId: 'POND',
  });
  const runId = world.getSnapshot().fishing.active!.id;
  world.dispatch({ type: 'FISH_CAST', runId, power: 70 });
  for (
    let tick = 0;
    tick < 40 && world.getSnapshot().fishing.active!.phase === 'waiting';
    tick++
  )
    world.dispatch({ type: 'FISH_CONTROL', runId, pressed: false, ticks: 1 });
  expect(
    world.dispatch({
      type: 'FISH_MOTION_CONTROL',
      runId,
      x: 50,
      y: 50,
      ticks: 3,
    }).ok,
  ).toBe(true);
  expect(world.getSnapshot().fishing.active).toMatchObject({
    phase: 'hook',
    motionStableTicks: 3,
  });
  return world;
}

it('round-trips a partial hold and replays the exact point inputs through a catch', () => {
  let data = partialHook().save();
  const restored = loadWorld(data);
  expect(restored.save()).toBe(data);
  const session = createTestSession({
    repository: {
      read: () => data,
      write: (save) => {
        data = save;
      },
    },
  });
  for (
    let tick = 0;
    tick < 600 && session.getSnapshot().fishing.active;
    tick++
  ) {
    const run = session.getSnapshot().fishing.active!;
    const zone = greenZone(run);
    const command: GameCommand =
      run.phase === 'hook'
        ? { type: 'FISH_MOTION_CONTROL', runId: run.id, x: 50, y: 50, ticks: 1 }
        : {
            type: 'FISH_CONTROL',
            runId: run.id,
            pressed: run.tension < (zone.low + zone.high) / 2,
            ticks: 1,
          };
    expect(session.execute(command)).toEqual(restored.dispatch(command));
  }
  expect(session.getSnapshot().fishing.lastResult).toMatchObject({
    caught: true,
  });
  expect(session.getSnapshot()).toEqual(restored.getSnapshot());
  expect(loadWorld(data).getSnapshot()).toEqual(session.getSnapshot());
  expect(replayWorld(session.getReplay())).toEqual(session.getSnapshot());
});

it('rejects missing, fractional, completed or impossible saved stability', () => {
  const world = partialHook();
  const threshold = motionTarget(world.getSnapshot().fishing.active!).holdTicks;
  for (const change of [
    { motionStableTicks: undefined },
    { motionStableTicks: -1 },
    { motionStableTicks: 1.5 },
    { motionStableTicks: threshold },
    { motionStableTicks: 16 },
    { phaseTick: 2 },
    { phaseTick: 128, tick: 200 },
    { phase: 'waiting' },
    { phase: 'fight' },
    { pressed: true },
  ]) {
    const save = JSON.parse(world.save());
    Object.assign(save.world.fishing.active, change);
    expect(() => loadWorld(JSON.stringify(save))).toThrow();
  }
  const fresh = createWorld(42);
  expect(loadWorld(fresh.save()).getSnapshot()).toEqual(fresh.getSnapshot());
});
