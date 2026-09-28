import { describe, expect, it } from 'vitest';
import {
  createLogBatch,
  debugLogWanted,
  sessionId,
} from '../../src/platform/device-log';

describe('device log', () => {
  it('logs only a device that opted in with ?debug=1, until ?debug=0', () => {
    expect(debugLogWanted('', null)).toBe(false);
    expect(debugLogWanted('?debug=1', null)).toBe(true);
    expect(debugLogWanted('', '1')).toBe(true);
    expect(debugLogWanted('?debug=0', '1')).toBe(false);
    expect(debugLogWanted('?debug=yes', null)).toBe(false);
  });

  it('keeps a bounded batch, dropping the oldest and saying how many', () => {
    const batch = createLogBatch(3);
    for (let t = 0; t < 5; t++) batch.push({ kind: 'motion', t });
    expect(batch.take()).toEqual({
      entries: [2, 3, 4].map((t) => ({ kind: 'motion', t })),
      dropped: 2,
    });
    expect(batch.take()).toEqual({ entries: [], dropped: 0 });
  });
});

describe('device log session id', () => {
  it('is a UUID-shaped id from random bytes, without a secure context', () => {
    const id = sessionId((bytes) => bytes.fill(171));
    expect(id).toBe('abababab-abab-abab-abab-abababababab');
    // The receiver accepts it as a session name.
    expect(id).toMatch(/^[a-z0-9-]{8,64}$/);
  });

  it('counts entries that were taken but never arrived', () => {
    const batch = createLogBatch(10);
    batch.push({ kind: 'motion' });
    const lost = batch.take();
    batch.lost(lost.entries.length);
    expect(batch.take()).toEqual({ entries: [], dropped: 1 });
  });
});
