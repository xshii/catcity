import { describe, expect, it } from 'vitest';
import { createLogBatch, debugLogWanted } from '../../src/platform/device-log';

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
