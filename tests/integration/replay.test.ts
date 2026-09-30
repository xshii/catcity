import { createTestSession } from '../helpers/session';
import { expect, it } from 'vitest';
import { replayWorld } from '../../harness/adapters/catcity/replay-world';

it('replays accepted and rejected commands and detects a tampered trace', () => {
  const session = createTestSession({
    repository: { read: () => null, write: () => {} },
  });
  session.execute({
    type: 'BUILD_BUILDING',
    buildingType: 'CAT_CAFE',
    position: { x: 4, y: 4 },
  });
  session.execute({
    type: 'BUILD_BUILDING',
    buildingType: 'CAT_CAFE',
    position: { x: 4, y: 4 },
  });
  session.execute({ type: 'ADVANCE_TIME', minutes: 123 });
  expect(replayWorld(session.getReplay())).toEqual(session.getSnapshot());
  const changed = session.getReplay();
  changed.entries[0]!.command = {
    type: 'BUILD_BUILDING',
    buildingType: 'CAT_CAFE',
    position: { x: 2, y: 2 },
  };
  expect(() => replayWorld(changed)).toThrow();
});

it('keeps a replayable checkpoint when the diagnostic window rotates', () => {
  const session = createTestSession({
    repository: { read: () => null, write: () => {} },
  });
  for (let i = 0; i < 1003; i++)
    session.execute({ type: 'ADVANCE_TIME', minutes: 1 });
  expect(session.getReplay().entries).toHaveLength(3);
  expect(replayWorld(session.getReplay())).toEqual(session.getSnapshot());
});

it('replays invitations: the one that moves in and the ones Core turned away', () => {
  const session = createTestSession({
    repository: { read: () => null, write: () => {} },
  });
  const invite = { type: 'INVITE_CAT', definitionId: 'BUDING' } as const;
  expect(session.execute(invite)).toEqual({ ok: false, error: 'NO_BED' });
  session.execute({
    type: 'BUILD_BUILDING',
    buildingType: 'CAT_APARTMENT',
    position: { x: 4, y: 3 },
  });
  expect(session.execute(invite).ok).toBe(true);
  expect(session.execute(invite)).toEqual({
    ok: false,
    error: 'ALREADY_INVITED',
  });
  session.execute({ type: 'ADVANCE_TIME', minutes: 60 });
  expect(replayWorld(session.getReplay())).toEqual(session.getSnapshot());
  expect(session.getSnapshot().cats.map((cat) => cat.name)).toEqual([
    'Mochi',
    '布丁',
  ]);
});
