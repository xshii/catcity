import { createTestSession } from '../helpers/session';
import {
  fishingFixture as createWorld,
  sessionTravel,
  finishFishing,
} from '../unit/fishing-fixture';
import { expect, it } from 'vitest';
import { loadWorld } from '../../src/core';
import { fishById, SPOTS } from '../../src/content/fishing';

it('starts with empty factual memories that survive a save round trip', () => {
  const world = createWorld(42);
  expect(world.getSnapshot().cats[0]!.fishingMemory).toBeNull();
  expect(world.getSnapshot().cats[0]!.fishGift).toBeNull();
  expect(world.getSnapshot().fishing).toMatchObject({
    active: null,
    lastResult: null,
    inventory: [],
  });
  expect(loadWorld(world.save()).getSnapshot()).toEqual(world.getSnapshot());
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
