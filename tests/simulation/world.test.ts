import { advance, buildCafe } from '../helpers/world';
import { buildingPrice, CAFE, CITY_START } from '../../src/content/city';
import { expect, it } from 'vitest';
import { createWorld } from '../../src/core/world';
import { assertWorld } from '../../src/core/schema';

it.each([0, 1, 42, 4294967295])(
  'survives 30 game days and is independent of time chunking: seed %s',
  (seed) => {
    const batch = createWorld(seed);
    const incremental = createWorld(seed);
    for (const game of [batch, incremental]) {
      buildCafe(game, { x: 4, y: 4 });
      // Mochi lives next door, so the cafe has one customer.
      game.dispatch({
        type: 'BUILD_BUILDING',
        buildingType: 'CAT_APARTMENT',
        position: { x: 4, y: 3 },
      });
      game.dispatch({
        type: 'ASSIGN_HOME',
        catId: 'mochi',
        buildingId: 'building-2',
      });
    }
    expect(advance(batch, 30 * 24 * 60).ok).toBe(true);
    for (let hour = 0; hour < 30 * 24; hour++) {
      advance(incremental, 17);
      advance(incremental, 43);
      expect(() => assertWorld(incremental.getSnapshot())).not.toThrow();
    }
    expect(incremental.getSnapshot()).toEqual(batch.getSnapshot());
    expect(batch.getSnapshot().coins).toBe(
      CITY_START.coins -
        buildingPrice('CAT_CAFE', 0) -
        buildingPrice('CAT_APARTMENT', 0) +
        720 * CAFE.coinsPerCustomer,
    );
  },
);
