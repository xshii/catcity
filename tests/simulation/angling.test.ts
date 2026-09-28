import { advance } from '../helpers/world';
import { fishingFixture as createWorld } from '../unit/fishing-fixture';
import { expect, it } from 'vitest';
import { loadWorld } from '../../src/core/world';
import { FISH_IDS } from '../../src/content/fishing';
import {
  greenZone,
  initialAngling,
  stepAngling,
} from '../../src/minigames/angling';

it('simulates 30 days of catch/sell/rest cycles without impossible values or losing replay state', () => {
  let world = createWorld(73);
  for (let day = 0; day < 30; day++) {
    if (world.getSnapshot().cats[0]!.needs.energy < 100)
      world.dispatch({ type: 'REST_CAT', catId: 'mochi' });
    advance(world, 1440);
    world.dispatch({
      spotId: 'POND',
      aimDepth: 50,

      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'BREAD',
      direction: day % 2 ? 30 : -30,
    });
    for (
      let tick = 0;
      tick < 600 && world.getSnapshot().fishing.active;
      tick++
    ) {
      const run = world.getSnapshot().fishing.active!;
      const zone = greenZone(run);
      const pressed =
        run.phase === 'charge'
          ? run.tick < 23
          : run.phase === 'hook'
            ? run.cursor >= zone.low && run.cursor <= zone.high
            : run.phase === 'fight' && run.tension < (zone.low + zone.high) / 2;
      expect(
        world.dispatch({
          type: 'FISH_CONTROL',
          runId: run.id,
          pressed,
          ticks: 1,
        }).ok,
      ).toBe(true);
    }
    const snapshot = world.getSnapshot();
    expect(snapshot.fishing.active).toBeNull();
    expect(snapshot.fishing.lastResult!.caught).toBe(true);
    expect(snapshot.cats[0]!.needs.energy).toBeGreaterThanOrEqual(0);
    world.dispatch({
      type: 'SELL_FISH',
      fishId: snapshot.fishing.inventory[0]!.id,
    });
    const save = world.save();
    world = loadWorld(save);
    expect(world.save()).toBe(save);
  }
  expect(world.getSnapshot().fishing.atlas.SILVER.count).toBe(15);
  expect(world.getSnapshot().fishing.atlas.CRUCIAN.count).toBe(15);
  expect(world.getSnapshot().coins).toBe(1300);
});

it('runs each fish difficulty deterministically and preserves held-input chunk equivalence', () => {
  for (const speciesId of FISH_IDS) {
    const input = {
      ...initialAngling({
        catBreed: 'RAGDOLL',
        spotId: 'POND',
        aimDepth: 50,

        id: 'angling-1',
        catId: 'mochi',
        seed: 42,
        baitId: 'BREAD',
        direction: 0,
        skillLevel: 1,
      }),
      phase: 'fight' as const,
      speciesId,
      weight: 1000,
      hasHeld: true,
    };
    let a = stepAngling(input, true, 4);
    let b = input;
    for (let i = 0; i < 4; i++) b = stepAngling(b, true, 1) as typeof input;
    expect(a).toEqual(b);
    for (let i = 0; i < 420 && a.phase === 'fight'; i++) {
      const zone = greenZone(a);
      a = stepAngling(a, a.tension < (zone.low + zone.high) / 2, 1);
    }
    expect(a.phase).toBe('caught');
  }
});
