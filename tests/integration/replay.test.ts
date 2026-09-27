import { expect, it } from 'vitest';
import { GameSession } from '../../src/application/session';
import { replayWorld } from '../../harness/adapters/catcity/replay-world';

it('replays accepted and rejected commands and detects a tampered trace', () => {
  const session = new GameSession({ read: () => null, write: () => {} });
  session.execute({ type: 'BUILD_CAFE', position: { x: 4, y: 4 } });
  session.execute({ type: 'BUILD_CAFE', position: { x: 4, y: 4 } });
  session.execute({ type: 'ADVANCE_TIME', minutes: 123 });
  expect(replayWorld(session.getReplay())).toEqual(session.getSnapshot());
  const changed = session.getReplay();
  changed.entries[0]!.command = {
    type: 'BUILD_CAFE',
    position: { x: 2, y: 2 },
  };
  expect(() => replayWorld(changed)).toThrow();
});

it('keeps a replayable checkpoint when the diagnostic window rotates', () => {
  const session = new GameSession({ read: () => null, write: () => {} });
  for (let i = 0; i < 1003; i++)
    session.execute({ type: 'ADVANCE_TIME', minutes: 1 });
  expect(session.getReplay().entries).toHaveLength(3);
  expect(replayWorld(session.getReplay())).toEqual(session.getSnapshot());
});
