import assert from 'node:assert/strict';
import { loadWorld } from '../../../src/core';
import type { ReplayRecord } from '../../../src/application';

export function replayWorld(record: ReplayRecord) {
  assert.equal(record.version, 1, 'Unsupported replay version');
  const world = loadWorld(record.initialSave);
  record.entries.forEach((entry, index) => {
    assert.equal(entry.sequence, index, 'Trace sequence gap');
    assert.deepEqual(
      world.dispatch(entry.command),
      entry.result,
      `Command ${index} result differs`,
    );
  });
  assert.deepEqual(
    world.getSnapshot(),
    record.expectedWorld,
    'Replayed world differs',
  );
  return world.getSnapshot();
}
