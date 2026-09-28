import { expect, it, vi } from 'vitest';
import { GameSession } from '../../src/application';

const repository = () => ({ read: () => null, write: vi.fn() });
const response = (text: string) => ({
  generate: vi.fn(async () => ({ catId: 'mochi', text })),
});

it('uses the injected primary provider without constructing an implicit fallback', async () => {
  const dialogue = response('custom primary');
  const fallbackDialogue = response('custom fallback');
  const session = new GameSession({
    repository: repository(),
    dialogue,
    fallbackDialogue,
    seed: 187,
  });
  expect((await session.talk('mochi', 'hello')).ok).toBe(true);
  expect(dialogue.generate).toHaveBeenCalledOnce();
  expect(fallbackDialogue.generate).not.toHaveBeenCalled();
  expect(session.getSnapshot().cats[0]!.memories[0]!.reply).toBe(
    'custom primary',
  );
  expect(session.getSnapshot().seed).toBe(187);
});

it('uses the injected fallback after primary failure and records only its validated proposal', async () => {
  const dialogue = {
    generate: vi.fn(async () => {
      throw new Error('offline');
    }),
  };
  const fallbackDialogue = response('configured offline response');
  const session = new GameSession({
    repository: repository(),
    dialogue,
    fallbackDialogue,
    seed: 42,
  });
  expect((await session.talk('mochi', 'hello')).ok).toBe(true);
  expect(fallbackDialogue.generate).toHaveBeenCalledOnce();
  expect(session.lastDialogueFallback).toBe(true);
  expect(session.getSnapshot().cats[0]!.memories[0]!.reply).toBe(
    'configured offline response',
  );
  expect(session.getSnapshot().coins).toBe(1000);
});

it.each(['repository', 'dialogue', 'fallbackDialogue', 'seed'])(
  'rejects missing %s at construction instead of choosing a hidden implementation',
  (field) => {
    const options: Record<string, unknown> = {
      repository: repository(),
      dialogue: response('primary'),
      fallbackDialogue: response('fallback'),
      seed: 42,
    };
    delete options[field];
    expect(() => Reflect.construct(GameSession, [options])).toThrow();
    options[field] = undefined;
    expect(() => Reflect.construct(GameSession, [options])).toThrow();
  },
);

it('rejects the removed positional constructor shape', () => {
  expect(() =>
    Reflect.construct(GameSession, [repository(), 42, response('primary')]),
  ).toThrow();
});

it('does not substitute another provider when the injected fallback is invalid', async () => {
  const storage = repository();
  const dialogue = {
    generate: async () => {
      throw new Error('offline');
    },
  };
  const fallbackDialogue = {
    generate: vi.fn(async () => ({
      catId: 'wrong',
      text: 'untrusted',
      coins: 1000,
    })),
  };
  const session = new GameSession({
    repository: storage,
    dialogue,
    fallbackDialogue,
    seed: 42,
  });
  const before = session.getSnapshot();
  await expect(session.talk('mochi', 'hello')).rejects.toThrow();
  expect(fallbackDialogue.generate).toHaveBeenCalledOnce();
  expect(session.getSnapshot()).toEqual(before);
  expect(storage.write).not.toHaveBeenCalled();
});
