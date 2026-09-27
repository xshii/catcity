import { expect, it } from 'vitest';
import { createWorld } from '../../src/core/world';
import { assertWorld } from '../../src/core/schema';

it.each([0, 1, 42, 4294967295])(
  'survives 30 game days and is independent of time chunking: seed %s',
  (seed) => {
    const batch = createWorld(seed);
    const incremental = createWorld(seed);
    batch.build({ x: 4, y: 4 });
    incremental.build({ x: 4, y: 4 });
    expect(batch.advanceTime(30 * 24 * 60).ok).toBe(true);
    for (let hour = 0; hour < 30 * 24; hour++) {
      incremental.advanceTime(17);
      incremental.advanceTime(43);
      expect(() => assertWorld(incremental.getSnapshot())).not.toThrow();
    }
    expect(incremental.getSnapshot()).toEqual(batch.getSnapshot());
    expect(batch.getSnapshot().coins).toBe(700 + 720 * 10);
  },
);
