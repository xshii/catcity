import { fishingFixture as createWorld } from './fishing-fixture';
import { expect, it } from 'vitest';
import { BAIT_IDS, FISH_IDS } from '../../src/content/fishing';
import { loadWorld } from '../../src/core/world';
import { failureTrash } from '../../src/core/fishing/rewards';
import { greenZone } from '../../src/minigames/angling';

it.each(
  BAIT_IDS.flatMap((baitId) =>
    [-45, 0, 45].map((direction) => ({ baitId, direction })),
  ),
)(
  'can hook trash after a low-star failure with $baitId aimed at $direction',
  ({ baitId, direction }) => {
    let trash = 0;
    let empty = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const world = createWorld(seed * 1000039);
      world.dispatch({
        spotId: 'POND',
        aimDepth: 50,

        type: 'FISH_BEGIN',
        catId: 'mochi',
        baitId,
        direction,
      });
      const runId = world.getSnapshot().fishing.active!.id;
      for (let n = 0; n < 23; n++)
        world.dispatch({
          type: 'FISH_CONTROL',
          runId,
          pressed: true,
          ticks: 1,
        });
      const restored = loadWorld(world.save());
      for (const game of [world, restored]) {
        for (let n = 0; n < 180 && game.getSnapshot().fishing.active; n++)
          game.dispatch({
            type: 'FISH_CONTROL',
            runId,
            pressed: false,
            ticks: 1,
          });
      }
      expect(world.getSnapshot()).toEqual(restored.getSnapshot());
      const state = world.getSnapshot();
      expect(state.fishing.lastResult!.caught).toBe(false);
      expect(state.fishing.inventory).toEqual([]);
      expect(state.fishing.xp).toBe(0);
      expect(state.cats[0]!.fishingMemory).toBeNull();
      expect(state.fishing.supplies.trash).toBe(
        state.fishing.lastResult!.trashAmount,
      );
      if (state.fishing.supplies.trash) {
        trash++;
        expect(world.dispatch({ type: 'RECYCLE_TRASH' }).ok).toBe(true);
        expect(world.getSnapshot().coins).toBe(1003);
      } else empty++;
      const before = world.save();
      expect(
        world.dispatch({
          type: 'FISH_CONTROL',
          runId,
          pressed: true,
          ticks: 1,
        }).ok,
      ).toBe(false);
      expect(world.save()).toBe(before);
    }
    expect(trash).toBeGreaterThan(0);
    expect(empty).toBeGreaterThan(0);
  },
);

it('never rewards cancellation', () => {
  const world = createWorld(42);
  world.dispatch({
    spotId: 'POND',
    aimDepth: 50,

    type: 'FISH_BEGIN',
    catId: 'mochi',
    baitId: 'BREAD',
    direction: 0,
  });
  world.dispatch({
    type: 'FISH_CANCEL',
    runId: world.getSnapshot().fishing.active!.id,
  });
  expect(world.getSnapshot().fishing.supplies.trash).toBe(0);
  expect(world.getSnapshot().fishing.lastResult).toBeNull();
});

it('excludes successful catches, non-fish encounters and high-star failures from trash rewards', () => {
  for (let seed = 1; seed <= 100; seed++) {
    for (const species of FISH_IDS)
      expect(failureTrash(seed, species, false)).toBe(0);
    for (const species of ['CATFISH', 'KOI', 'MOON_CARP', 'SEA_BREAM'] as const)
      expect(failureTrash(seed, species, true)).toBe(0);
    expect(failureTrash(seed, null, true)).toBe(0);
  }
});

it('settles line-break trash once across weak and strong casts, save/load and replayed inputs', () => {
  for (const chargeTicks of [1, 23, 32]) {
    let rewardedFailures = 0;
    let emptyFailures = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const world = createWorld(seed * 1000039);
      world.dispatch({
        spotId: 'POND',
        aimDepth: 50,

        type: 'FISH_BEGIN',
        catId: 'mochi',
        baitId: 'WORM',
        direction: -30,
      });
      const runId = world.getSnapshot().fishing.active!.id;
      for (let tick = 0; tick < 150; tick++) {
        const run = world.getSnapshot().fishing.active!;
        if (run.phase === 'fight') break;
        const zone = greenZone(run);
        expect(
          world.dispatch({
            type: 'FISH_CONTROL',
            runId,
            pressed:
              run.phase === 'charge'
                ? run.tick < chargeTicks
                : run.phase === 'hook' &&
                  run.cursor >= zone.low &&
                  run.cursor <= zone.high,
            ticks: 1,
          }).ok,
        ).toBe(true);
      }
      expect(world.getSnapshot().fishing.active!.phase).toBe('fight');
      const before = world.save();
      expect(
        world.dispatch({
          type: 'FISH_CONTROL',
          runId,
          pressed: true,
          ticks: 1,
          trashAmount: 1,
        }),
      ).toEqual({ ok: false, error: 'INVALID_COMMAND' });
      expect(world.save()).toBe(before);
      const restored = loadWorld(before);
      for (const game of [world, restored]) {
        for (
          let tick = 0;
          tick < 100 && game.getSnapshot().fishing.active;
          tick++
        )
          expect(
            game.dispatch({
              type: 'FISH_CONTROL',
              runId,
              pressed: true,
              ticks: 1,
            }).ok,
          ).toBe(true);
      }
      expect(restored.save()).toBe(world.save());
      const state = world.getSnapshot();
      expect(state.fishing.lastResult).toMatchObject({
        caught: false,
        reason: 'line-break',
        speciesId: 'SILVER',
      });
      expect(state.fishing.inventory).toEqual([]);
      expect(state.fishing.xp).toBe(0);
      expect(state.fishing.supplies.trash).toBe(
        state.fishing.lastResult!.trashAmount,
      );
      if (state.fishing.supplies.trash) rewardedFailures++;
      else emptyFailures++;
      const settled = world.save();
      for (const command of [
        { type: 'FISH_CONTROL', runId, pressed: true, ticks: 4 },
        { type: 'FISH_CANCEL', runId },
      ]) {
        expect(world.dispatch(command)).toEqual({
          ok: false,
          error: 'RUN_NOT_FOUND',
        });
        expect(world.save()).toBe(settled);
      }
      const corrupt = JSON.parse(settled);
      corrupt.world.fishing.lastResult.trashAmount =
        1 - state.fishing.lastResult!.trashAmount;
      expect(() => loadWorld(JSON.stringify(corrupt))).toThrow(
        'Invalid failure reward',
      );
    }
    expect(rewardedFailures).toBeGreaterThan(0);
    expect(emptyFailures).toBeGreaterThan(0);
  }
});
