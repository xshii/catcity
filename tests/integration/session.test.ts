import {
  createTestSession,
  memoryRepository as repository,
} from '../helpers/session';
import { expect, it, vi } from 'vitest';
import { createWorld } from '../../src/core';
import { MockDialogueProvider } from '../helpers/mock-dialogue';
import { RuleBasedDialogueProvider } from '../../src/providers/rule-dialogue';
import { resolveDialogue } from '../../src/application/dialogue';

it('uses rule dialogue and persists the core-owned memory through reload', async () => {
  const storage = repository();
  const session = createTestSession({ repository: storage });
  expect((await session.talk('mochi', '鱼')).ok).toBe(true);
  const restored = createTestSession({ repository: storage });
  expect(restored.getSnapshot()).toEqual(session.getSnapshot());
  expect(restored.getSnapshot().cats[0]!.memories[0]!.reply).toContain('鱼');
});

it.each(['throw', 'bad-target', 'extra-field', 'bad-text'])(
  'falls back from an invalid provider: %s',
  async (kind) => {
    const provider = new MockDialogueProvider(() => {
      if (kind === 'throw') throw new Error('offline');
      if (kind === 'bad-target') return { catId: 'wrong', text: 'hello' };
      if (kind === 'extra-field')
        return { catId: 'mochi', text: 'hello', coins: 1000 };
      return { catId: 'mochi', text: '' };
    });
    const session = createTestSession({
      repository: repository(),
      seed: 42,
      dialogue: provider,
    });
    expect((await session.talk('mochi', 'hello')).ok).toBe(true);
    expect(session.lastDialogueFallback).toBe(true);
    expect(session.getSnapshot().coins).toBe(1000);
    expect(session.getSnapshot().cats[0]!.playerBond).toBe(1);
  },
);

it('times out and falls back without waiting for a hung provider', async () => {
  vi.useFakeTimers();
  try {
    const cat = createWorld(1).getSnapshot().cats[0]!;
    const result = resolveDialogue(
      new MockDialogueProvider(() => new Promise(() => {})),
      new RuleBasedDialogueProvider(),
      {
        cat,
        message: 'hi',
        recentMemories: [],
        fishingMemory: null,
        fishGift: null,
        favoriteFish: cat.favoriteFish,
      },
      20,
    );
    await vi.advanceTimersByTimeAsync(20);
    expect((await result).usedFallback).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

it('rejects stale dialogue after fixture replacement', async () => {
  let complete!: (value: unknown) => void;
  const session = createTestSession({
    repository: repository(),
    seed: 42,
    dialogue: new MockDialogueProvider(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    ),
  });
  const pending = session.talk('mochi', 'hi');
  await Promise.resolve();
  session.loadFixture(createWorld(2).save());
  complete({ catId: 'mochi', text: 'hello' });
  expect(await pending).toMatchObject({ ok: false, error: 'STALE_DIALOGUE' });
  expect(session.getSnapshot().cats[0]!.memories).toHaveLength(0);
});

it('preserves corrupt saves and reports write failures', () => {
  const write = vi.fn();
  const corrupt = createTestSession({
    repository: { read: () => 'broken', write },
  });
  corrupt.execute({
    type: 'BUILD_BUILDING',
    buildingType: 'CAT_CAFE',
    position: { x: 3, y: 3 },
  });
  expect(corrupt.storageError).not.toBeNull();
  expect(write).not.toHaveBeenCalled();
  const quota = createTestSession({
    repository: {
      read: () => null,
      write: () => {
        throw new Error('quota');
      },
    },
  });
  expect(quota.save()).toBe(false);
  expect(quota.storageError).not.toBeNull();
});
