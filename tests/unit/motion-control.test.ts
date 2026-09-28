import { describe, expect, it } from 'vitest';
import { loadWorld, type World } from '../../src/core';
import { fishById, type BaitId } from '../../src/content/fish';
import { greenZone } from '../../src/minigames/angling';
import { finishFishing, fishingFixture } from './fishing-fixture';

function bite(seed = 42, baitId: BaitId = 'WORM', power = 70): World {
  const world = fishingFixture(seed);
  expect(
    world.dispatch({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      spotId: 'POND',
      baitId,
      direction: 0,
      aimDepth: 50,
    }).ok,
  ).toBe(true);
  const runId = world.getSnapshot().fishing.active!.id;
  expect(world.dispatch({ type: 'FISH_CAST', runId, power }).ok).toBe(true);
  for (
    let tick = 0;
    tick < 40 && world.getSnapshot().fishing.active!.phase === 'waiting';
    tick++
  ) {
    expect(
      world.dispatch({ type: 'FISH_CONTROL', runId, pressed: false, ticks: 1 })
        .ok,
    ).toBe(true);
  }
  expect(world.getSnapshot().fishing.active!.phase).toBe('hook');
  return world;
}

function point(world: World, x = 50, y = 50, ticks = 1) {
  return world.dispatch({
    type: 'FISH_MOTION_CONTROL',
    runId: world.getSnapshot().fishing.active!.id,
    x,
    y,
    ticks,
  });
}

function holdTicks(world: World) {
  const speciesId = world.getSnapshot().fishing.active!.speciesId;
  return 6 + 2 * (speciesId ? fishById(speciesId).stars : 1);
}

describe('circle hook control', () => {
  it('requires consecutive in-circle ticks, then uses the existing fight and once-only reward', () => {
    const world = bite();
    const before = world.getSnapshot();
    const required = holdTicks(world);
    for (let tick = 1; tick < required; tick++) {
      expect(point(world)).toMatchObject({ ok: true });
      expect(world.getSnapshot().fishing.active).toMatchObject({
        phase: 'hook',
        motionStableTicks: tick,
      });
    }
    expect(point(world).ok).toBe(true);
    expect(world.getSnapshot().fishing.active).toMatchObject({
      phase: 'fight',
      phaseTick: 0,
      motionStableTicks: 0,
      progress: 0,
    });
    expect(world.getSnapshot().cats[0]!.needs.energy).toBe(
      before.cats[0]!.needs.energy,
    );
    expect(world.getSnapshot().fishing.baits).toEqual(before.fishing.baits);
    const saved = world.save();
    expect(point(world)).toEqual({ ok: false, error: 'MOTION_NOT_READY' });
    expect(world.save()).toBe(saved);
    finishFishing(world);
    expect(world.getSnapshot().fishing.inventory).toHaveLength(1);
    const after = world.save();
    expect(
      world.dispatch({
        type: 'FISH_MOTION_CONTROL',
        runId: before.fishing.active!.id,
        x: 50,
        y: 50,
        ticks: 1,
      }).ok,
    ).toBe(false);
    expect(world.save()).toBe(after);
  });

  it('counts the circle boundary but resets on an outside diagonal and manual input', () => {
    const world = bite();
    const zone = greenZone(world.getSnapshot().fishing.active!);
    const radius = (zone.high - zone.low) / 2;
    expect(point(world, 50 + radius, 50, 2).ok).toBe(true);
    expect(world.getSnapshot().fishing.active).toMatchObject({
      motionStableTicks: 2,
    });
    expect(point(world, 50 + radius, 51).ok).toBe(true);
    expect(world.getSnapshot().fishing.active).toMatchObject({
      motionStableTicks: 0,
    });
    expect(point(world, 50, 50, 3).ok).toBe(true);
    expect(
      world.dispatch({
        type: 'FISH_CONTROL',
        runId: world.getSnapshot().fishing.active!.id,
        pressed: false,
        ticks: 1,
      }).ok,
    ).toBe(true);
    expect(world.getSnapshot().fishing.active).toMatchObject({
      phase: 'hook',
      motionStableTicks: 0,
    });
    finishFishing(world);
    expect(world.getSnapshot().fishing.lastResult!.caught).toBe(true);
  });

  it('expires at the original deadline even if the last stable tick would complete the hook', () => {
    const world = bite();
    const required = holdTicks(world);
    for (let tick = 0; tick < 128 - required; tick++)
      expect(point(world, 0, 0).ok).toBe(true);
    for (let tick = 1; tick < required; tick++)
      expect(point(world).ok).toBe(true);
    expect(world.getSnapshot().fishing.active).toMatchObject({
      phase: 'hook',
      phaseTick: 127,
      motionStableTicks: required - 1,
    });
    expect(point(world, 50, 50, 4).ok).toBe(true);
    expect(world.getSnapshot().fishing.active).toBeNull();
    expect(world.getSnapshot().fishing.lastResult).toMatchObject({
      caught: false,
      reason: 'missed-hook',
    });
    expect(world.getSnapshot().fishing.inventory).toEqual([]);
  });

  it('rejects invalid points, forged success, invalid ticks, wrong runs and non-hook phases atomically', () => {
    const world = bite();
    const command = {
      type: 'FISH_MOTION_CONTROL',
      runId: world.getSnapshot().fishing.active!.id,
      x: 50,
      y: 50,
      ticks: 1,
    };
    for (const change of [
      { x: -1 },
      { x: 101 },
      { x: 2.5 },
      { x: NaN },
      { y: -1 },
      { y: 101 },
      { y: 2.5 },
      { y: undefined },
      { ticks: 0 },
      { ticks: 5 },
      { ticks: 1.5 },
      { caught: true },
      { runId: 'absent' },
    ]) {
      const before = world.save();
      expect(world.dispatch({ ...command, ...change }).ok).toBe(false);
      expect(world.save()).toBe(before);
    }
    const uncast = fishingFixture(42);
    uncast.dispatch({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      spotId: 'POND',
      baitId: 'WORM',
      direction: 0,
      aimDepth: 50,
    });
    for (const phase of ['charge', 'waiting']) {
      expect(uncast.getSnapshot().fishing.active!.phase).toBe(phase);
      const before = uncast.save();
      expect(point(uncast)).toEqual({ ok: false, error: 'MOTION_NOT_READY' });
      expect(uncast.save()).toBe(before);
      if (phase === 'charge')
        uncast.dispatch({
          type: 'FISH_CAST',
          runId: uncast.getSnapshot().fishing.active!.id,
          power: 70,
        });
    }
  });

  it('produces the same state from bounded batches and individual ticks', () => {
    const batched = bite();
    const singles = loadWorld(batched.save());
    for (const position of [
      { x: 50, y: 50 },
      { x: 0, y: 0 },
      { x: 50, y: 50 },
    ]) {
      expect(point(batched, position.x, position.y, 4).ok).toBe(true);
      for (let tick = 0; tick < 4; tick++)
        expect(point(singles, position.x, position.y).ok).toBe(true);
      expect(batched.save()).toBe(singles.save());
    }
  });

  it.each(['can', 'coins'] as const)(
    'settles %s directly after a stable hook, with no fish reward or duplicate consumption',
    (kind) => {
      const candidates = Array.from({ length: 16 }, (_, n) =>
        bite((n + 1) * 1000039, 'BREAD', 20),
      );
      const world = candidates.find(
        (candidate) =>
          candidate.getSnapshot().fishing.active!.catchKind === kind,
      )!;
      expect(world).toBeDefined();
      const before = world.getSnapshot();
      const required = holdTicks(world);
      for (let tick = 0; tick < required; tick++)
        expect(point(world).ok).toBe(true);
      const after = world.getSnapshot();
      expect(after.fishing.active).toBeNull();
      expect(after.fishing.lastResult).toMatchObject({
        caught: true,
        catchKind: kind,
      });
      expect(after.fishing.inventory).toEqual([]);
      expect(after.fishing.xp).toBe(before.fishing.xp);
      expect(after.cats[0]!.needs.energy).toBe(before.cats[0]!.needs.energy);
      if (kind === 'can')
        expect(after.fishing.supplies.cans).toBe(
          before.fishing.supplies.cans + 1,
        );
      else
        expect(after.coins).toBe(
          before.coins + before.fishing.active!.lootAmount,
        );
    },
  );
});
