import { advance, buildCafe } from '../helpers/world';
import { expect, it } from 'vitest';
import { createWorld, loadWorld } from '../../src/core/world';
import { assertWorld } from '../../src/core/schema';

it.each([0, 42])(
  'keeps city walking, roads, homes and income deterministic across 30 days: seed %s',
  (seed) => {
    let batch = createWorld(seed);
    let sliced = createWorld(seed);
    for (const game of [batch, sliced]) {
      expect(buildCafe(game, { x: 4, y: 4 }).ok).toBe(true);
      expect(
        game.dispatch({
          type: 'BUILD_BUILDING',
          buildingType: 'CAT_APARTMENT',
          position: { x: 3, y: 4 },
        }).ok,
      ).toBe(true);
      expect(
        game.dispatch({
          type: 'ASSIGN_HOME',
          catId: 'mochi',
          buildingId: 'building-2',
        }).ok,
      ).toBe(true);
    }
    for (let day = 0; day < 30; day++) {
      for (const game of [batch, sliced]) {
        // An idle hour recovers a tired cat by itself.
        if (game.getSnapshot().cats[0]!.needs.energy < 100)
          expect(advance(game, 60).ok).toBe(true);
        expect(
          game.dispatch({
            type: 'WALK_CAT',
            catId: 'mochi',
            destination: { x: day % 2 === 0 ? 6 : 3, y: 6 },
          }).ok,
        ).toBe(true);
      }
      expect(advance(batch, 1440).ok).toBe(true);
      expect(advance(sliced, 17).ok).toBe(true);
      expect(advance(sliced, 1423).ok).toBe(true);
      expect(sliced.getSnapshot()).toEqual(batch.getSnapshot());
      expect(() => assertWorld(batch.getSnapshot())).not.toThrow();
      expect(batch.getSnapshot().cats[0]!.walk).toBeNull();
      expect(batch.getSnapshot().cats[0]!.needs.energy).toBeGreaterThan(0);
      batch = loadWorld(batch.save());
      sliced = loadWorld(sliced.save());
    }
  },
);
