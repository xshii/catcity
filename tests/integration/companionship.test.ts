import { createTestSession } from '../helpers/session';
import {
  fishingFixture as createWorld,
  sessionTravel,
  finishFishing,
} from '../unit/fishing-fixture';
import { expect, it } from 'vitest';
import legacy from '../fixtures/save-v1.json';
import previous from '../fixtures/save-v8.json';
import { loadWorld } from '../../src/core';
import { fishById, SPOTS } from '../../src/content/fish';

it('starts with empty factual memories and rejects prior/future save formats', () => {
  const world = createWorld(42);
  expect(world.getSnapshot().cats[0]!.fishingMemory).toBeNull();
  expect(world.getSnapshot().cats[0]!.fishGift).toBeNull();
  expect(world.getSnapshot().fishing).toMatchObject({
    active: null,
    lastResult: null,
    inventory: [],
  });
  expect(JSON.parse(world.save()).saveVersion).toBe(10);
  expect(loadWorld(world.save()).getSnapshot()).toEqual(world.getSnapshot());
  for (const save of [
    legacy,
    previous,
    { ...JSON.parse(world.save()), saveVersion: 99 },
  ])
    expect(() => loadWorld(JSON.stringify(save))).toThrow();
});

it('rejects impossible fishing and first-memory records when loading saves', () => {
  const world = createWorld(42);
  world.dispatch({
    spotId: 'POND',
    aimDepth: 50,

    type: 'FISH_BEGIN',
    catId: 'mochi',
    baitId: 'BREAD',
    direction: -30,
  });
  for (const changes of [
    { catId: 'missing' },
    { phaseTick: 999 },
    { seed: 0 },
    { choices: [0, 1, 2] },
  ]) {
    const save = JSON.parse(world.save());
    Object.assign(save.world.fishing.active, changes);
    expect(() => loadWorld(JSON.stringify(save))).toThrow();
  }
  finishFishing(world);
  for (const changes of [
    { runId: 'outing-1' },
    { minute: 999 },
    { spotId: 'COAST' },
    { speciesId: 'MACKEREL' },
  ]) {
    const save = JSON.parse(world.save());
    Object.assign(save.world.cats[0].fishingMemory, changes);
    expect(() => loadWorld(JSON.stringify(save))).toThrow();
  }
});

it('recalls only real shared catches after reload with the offline provider', async () => {
  let save: string | null = null;
  const repo = {
    read: () => save,
    write: (value: string) => {
      save = value;
    },
  };
  const session = createTestSession({ repository: repo });
  await session.talk('mochi', '还记得我们钓鱼吗？');
  expect(session.getSnapshot().cats[0]!.memories.at(-1)!.reply).toContain(
    '还没有',
  );
  sessionTravel(session);
  expect(
    session.execute({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'BREAD',
      direction: -30,
      aimDepth: 50,
      spotId: 'POND',
    }).ok,
  ).toBe(true);
  finishFishing({
    getSnapshot: () => session.getSnapshot(),
    dispatch: (command) => session.execute(command),
  });
  const memory = session.getSnapshot().cats[0]!.fishingMemory!;
  const restored = createTestSession({ repository: repo });
  await restored.talk('mochi', '还记得我们钓鱼吗？');
  const reply = restored.getSnapshot().cats[0]!.memories.at(-1)!.reply;
  expect(reply).toContain(fishById(memory.speciesId).name);
  expect(reply).toContain(SPOTS[memory.spotId].name);
  expect(restored.getSnapshot().cats[0]!.fishingMemory).toEqual(memory);
  await restored.talk('mochi', '今天有点累');
  expect(restored.getSnapshot().cats[0]!.memories.at(-1)!.reply).toContain(
    '歇一会',
  );
});

it('preserves incompatible v8 data until explicit reset to the single current fishing schema', () => {
  let saved = JSON.stringify(previous);
  const original = saved;
  const session = createTestSession({
    repository: {
      read: () => saved,
      write: (next) => {
        saved = next;
      },
    },
  });
  expect(session.storageError).not.toBeNull();
  session.execute({ type: 'ADVANCE_TIME', minutes: 30 });
  expect(saved).toBe(original);
  session.resetDemo();
  expect(JSON.parse(saved)).toMatchObject({
    saveVersion: 10,
    contentVersion: 5,
  });
  expect(loadWorld(saved).getSnapshot()).not.toHaveProperty('outings');
});
