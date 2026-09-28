import { createTestSession } from '../helpers/session';
import {
  fishingFixture as createWorld,
  sessionTravel,
} from '../unit/fishing-fixture';
import { expect, it } from 'vitest';
import { loadWorld } from '../../src/core';
import { greenZone } from '../../src/minigames/angling';
import { replayWorld } from '../../harness/adapters/catcity/replay-world';
import oldSave from '../fixtures/save-v6.json';

it('preserves an incompatible v6 save until explicit reset to v10', () => {
  expect(() => loadWorld(JSON.stringify(oldSave))).toThrow();
  let data = JSON.stringify(oldSave);
  const original = data;
  const session = createTestSession({
    repository: {
      read: () => data,
      write: (next) => {
        data = next;
      },
    },
  });
  expect(session.storageError).not.toBeNull();
  session.execute({ type: 'ADVANCE_TIME', minutes: 10 });
  expect(data).toBe(original);
  session.resetDemo();
  expect(JSON.parse(data)).toMatchObject({
    saveVersion: 10,
    contentVersion: 5,
  });
});

it('persists aim and cast power and rejects missing or impossible saved aim', () => {
  const world = createWorld(42);
  world.dispatch({
    spotId: 'POND',

    type: 'FISH_BEGIN',
    catId: 'mochi',
    baitId: 'WORM',
    direction: 25,
    aimDepth: 78,
  });
  const runId = world.getSnapshot().fishing.active!.id;
  world.dispatch({ type: 'FISH_CAST', runId, power: 61 });
  const save = world.save();
  expect(loadWorld(save).save()).toBe(save);
  expect(loadWorld(save).getSnapshot().fishing.active).toMatchObject({
    direction: 25,
    aimDepth: 78,
    power: 61,
  });
  for (const value of [-1, 101, 2.5, undefined]) {
    const corrupt = JSON.parse(save);
    if (value === undefined) delete corrupt.world.fishing.active.aimDepth;
    else corrupt.world.fishing.active.aimDepth = value;
    expect(() => loadWorld(JSON.stringify(corrupt))).toThrow();
  }
});

it('replays explicit cast commands and continues the same catch after save/load', () => {
  let data: string | null = null;
  const session = createTestSession({
    repository: {
      read: () => data,
      write: (next) => {
        data = next;
      },
    },
  });
  sessionTravel(session);
  session.execute({
    type: 'FISH_BEGIN',
    catId: 'mochi',
    baitId: 'WORM',
    spotId: 'POND',
    direction: -30,
    aimDepth: 80,
  });
  const runId = session.getSnapshot().fishing.active!.id;
  expect(session.execute({ type: 'FISH_CAST', runId, power: 70 }).ok).toBe(
    true,
  );
  expect(session.execute({ type: 'FISH_CAST', runId, power: 30 }).ok).toBe(
    false,
  );
  const restored = loadWorld(data!);
  for (
    let tick = 0;
    tick < 600 && session.getSnapshot().fishing.active;
    tick++
  ) {
    const run = session.getSnapshot().fishing.active!;
    const zone = greenZone(run);
    const command = {
      type: 'FISH_CONTROL' as const,
      runId,
      pressed:
        run.phase === 'hook'
          ? run.cursor >= zone.low && run.cursor <= zone.high
          : run.phase === 'fight' && run.tension < (zone.low + zone.high) / 2,
      ticks: 1,
    };
    expect(session.execute(command)).toEqual(restored.dispatch(command));
  }
  expect(session.getSnapshot().fishing.lastResult!.caught).toBe(true);
  expect(restored.getSnapshot()).toEqual(session.getSnapshot());
  expect(replayWorld(session.getReplay())).toEqual(session.getSnapshot());
});
