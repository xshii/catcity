import { advance, buildCafe } from '../helpers/world';
import { expect, it } from 'vitest';
import { createWorld } from '../../src/core/world';
import { assertWorld } from '../../src/core/schema';

it.each([0, 1, 42, 4294967295])(
  'survives 30 game days and is independent of time chunking: seed %s',
  (seed) => {
    const batch = createWorld(seed);
    const incremental = createWorld(seed);
    buildCafe(batch, { x: 4, y: 4 });
    buildCafe(incremental, { x: 4, y: 4 });
    expect(advance(batch, 30 * 24 * 60).ok).toBe(true);
    for (let hour = 0; hour < 30 * 24; hour++) {
      advance(incremental, 17);
      advance(incremental, 43);
      expect(() => assertWorld(incremental.getSnapshot())).not.toThrow();
    }
    expect(incremental.getSnapshot()).toEqual(batch.getSnapshot());
    expect(batch.getSnapshot().coins).toBe(700 + 720 * 10);
  },
);
