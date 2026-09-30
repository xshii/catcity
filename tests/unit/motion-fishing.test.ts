import { expect, it } from 'vitest';
import { createWorld, loadWorld } from '../../src/core/world';
import { FISHING, fishById } from '../../src/content/fishing';
import { fishPoint, motionSchedule } from '../../src/minigames/angling-motion';

function begin(world = createWorld(42)) {
  expect(
    world.dispatch({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      spotId: 'POND',
      baitId: 'WORM',
      direction: 30,
      aimDepth: 50,
      mode: 'motion',
    }).ok,
  ).toBe(true);
  return { world, runId: world.getSnapshot().fishing.active!.id };
}
const tick = (
  world: ReturnType<typeof createWorld>,
  runId: string,
  x = 50,
  y = 50,
) => world.dispatch({ type: 'FISH_MOTION_CONTROL', runId, x, y, ticks: 1 });

function toFight() {
  const { world, runId } = begin();
  expect(world.dispatch({ type: 'FISH_CAST', runId, power: 60 }).ok).toBe(true);
  const bite = motionSchedule(world.getSnapshot().fishing.active!).bite;
  for (let i = 0; i < bite; i++) expect(tick(world, runId).ok).toBe(true);
  expect(world.getSnapshot().fishing.active!.phase).toBe('hook');
  expect(world.dispatch({ type: 'FISH_STRIKE', runId }).ok).toBe(true);
  expect(world.getSnapshot().fishing.active!.phase).toBe('fight');
  return { world, runId };
}

it('charges stamina and bait at the swing, not when a motion run starts', () => {
  const { world, runId } = begin();
  const started = world.getSnapshot();
  expect(started.cats[0]!.needs.energy).toBe(100);
  expect(started.fishing.baits.WORM).toBe(FISHING.bait.initial.WORM);
  expect(world.dispatch({ type: 'FISH_CANCEL', runId }).ok).toBe(true);
  expect(world.getSnapshot().cats[0]!.needs.energy).toBe(100);
  const second = begin(world);
  expect(
    world.dispatch({ type: 'FISH_CAST', runId: second.runId, power: 60 }).ok,
  ).toBe(true);
  expect(world.getSnapshot().cats[0]!.needs.energy).toBe(
    100 - FISHING.cast.staminaCost,
  );
  expect(world.getSnapshot().fishing.baits.WORM).toBe(
    FISHING.bait.initial.WORM - 1,
  );
});

it('keeps button and motion inputs apart and rejects them atomically', () => {
  const { world, runId } = begin();
  const before = world.save();
  expect(tick(world, runId)).toEqual({ ok: false, error: 'CAST_NOT_READY' });
  expect(
    world.dispatch({ type: 'FISH_CONTROL', runId, pressed: true, ticks: 1 }),
  ).toEqual({ ok: false, error: 'WRONG_INPUT_MODE' });
  expect(world.save()).toBe(before);
  const buttons = createWorld(42);
  buttons.dispatch({
    type: 'FISH_BEGIN',
    catId: 'mochi',
    spotId: 'POND',
    baitId: 'BREAD',
    direction: 0,
    aimDepth: 50,
  });
  const buttonRun = buttons.getSnapshot().fishing.active!;
  expect(buttonRun.mode).toBe('buttons');
  expect(
    buttons.dispatch({ type: 'FISH_STRIKE', runId: buttonRun.id }),
  ).toEqual({ ok: false, error: 'WRONG_INPUT_MODE' });
});

it('lands a fish by following it, and resumes a saved fight identically', () => {
  const { world, runId } = toFight();
  const follow = (game: ReturnType<typeof createWorld>) => {
    const run = game.getSnapshot().fishing.active!;
    const fish = fishPoint(run, run.phaseTick + 1);
    return tick(game, runId, fish.x, fish.y);
  };
  for (let i = 0; i < 10; i++) expect(follow(world).ok).toBe(true);
  const restored = loadWorld(world.save());
  expect(restored.getSnapshot()).toEqual(world.getSnapshot());
  for (let i = 0; i < 400 && world.getSnapshot().fishing.active; i++) {
    follow(world);
    follow(restored);
  }
  expect(restored.save()).toBe(world.save());
  const result = world.getSnapshot().fishing.lastResult!;
  expect(result).toMatchObject({ caught: true, speciesId: 'CRUCIAN' });
  expect(world.getSnapshot().fishing.inventory).toHaveLength(1);
});

it('rejects saves whose motion state contradicts its phase', () => {
  const { world } = toFight();
  const fight = world.save();
  for (const changes of [
    { strike: 'none' },
    { hold: 1_000_000 },
    { mode: 'buttons' },
  ]) {
    const save = JSON.parse(fight);
    Object.assign(save.world.fishing.active, changes);
    expect(() => loadWorld(JSON.stringify(save))).toThrow();
  }
  const waiting = begin();
  waiting.world.dispatch({
    type: 'FISH_CAST',
    runId: waiting.runId,
    power: 60,
  });
  const save = JSON.parse(waiting.world.save());
  save.world.fishing.active.hold = 5;
  expect(() => loadWorld(JSON.stringify(save))).toThrow();
});

it('rejects saved fight progress the rules could not have reached', () => {
  const F = FISHING.motion.fight;
  const { world, runId } = toFight();
  const settling = world.getSnapshot().fishing.active!;
  expect(settling.strike).toBe('perfect');
  const tamper = (changes: object) => {
    const save = JSON.parse(world.save());
    Object.assign(save.world.fishing.active, changes);
    return () => loadWorld(JSON.stringify(save));
  };
  // Settling in freezes the hold at the strike's bonus.
  expect(tamper({ hold: settling.hold + 1 })).toThrow();
  expect(tamper({ hold: settling.hold - 1 })).toThrow();
  expect(tamper({ strike: 'good' })).toThrow();
  const target = F.holdTicks[fishById(settling.speciesId!).stars];
  expect(tamper({ strike: 'good', hold: 0 })).not.toThrow();
  expect(tamper({ strike: 'good', hold: target - 1 })).toThrow();
  // The line starts slack and stays slack while settling in.
  expect(settling.tension).toBe(0);
  expect(tamper({ tension: 1 })).toThrow();
  // After settling in, at most one tick of hold per tick of fight.
  for (let i = 0; i < F.graceTicks + 5; i++) {
    const run = world.getSnapshot().fishing.active!;
    const fish = fishPoint(run, run.phaseTick + 1);
    tick(world, runId, fish.x, fish.y);
  }
  const run = world.getSnapshot().fishing.active!;
  expect(run.hold).toBe(settling.hold + 5);
  expect(tamper({})).not.toThrow();
  expect(tamper({ hold: run.hold + 1 })).toThrow();
  // Tension rises at most one pull per tick after settling in; full tension snaps.
  const pull = F.tug.risePerTick[fishById(run.speciesId!).stars];
  expect(tamper({ tension: 5 * pull })).not.toThrow();
  expect(tamper({ tension: 5 * pull + 1 })).toThrow();
  expect(tamper({ tension: 100 })).toThrow();
});

/** Ticks with the rod tip off the fish and behind it (the near edge). */
function away(world: ReturnType<typeof createWorld>, runId: string) {
  const run = world.getSnapshot().fishing.active!;
  const fish = fishPoint(run, run.phaseTick + 1);
  return tick(world, runId, fish.x > 50 ? 0 : 100, 100);
}

it('resumes a saved fight with the fish outside the ring, which breaks free on time (user, 2026-09-30)', () => {
  const F = FISHING.motion.fight;
  const { world, runId } = toFight();
  for (let i = 0; i < F.graceTicks + 10; i++)
    expect(away(world, runId).ok).toBe(true);
  const run = world.getSnapshot().fishing.active!;
  expect(run.outside).toBe(10);
  const restored = loadWorld(world.save());
  expect(restored.getSnapshot()).toEqual(world.getSnapshot());
  const limit = F.escapeOutsideTicks[fishById(run.speciesId!).stars];
  for (let i = 10; i < limit; i++) {
    away(world, runId);
    away(restored, runId);
  }
  expect(restored.save()).toBe(world.save());
  expect(world.getSnapshot().fishing.active).toBeNull();
  expect(world.getSnapshot().fishing.lastResult).toMatchObject({
    caught: false,
    reason: 'out-of-ring',
  });
  expect(loadWorld(world.save()).save()).toBe(world.save());
});

it('rejects a saved time outside the ring the rules could not have reached', () => {
  const F = FISHING.motion.fight;
  const { world, runId } = toFight();
  const tamper = (changes: object, game = world) => {
    const save = JSON.parse(game.save());
    Object.assign(save.world.fishing.active, changes);
    return () => loadWorld(JSON.stringify(save));
  };
  // Nothing counts while settling in.
  expect(tamper({ outside: 1 })).toThrow();
  // After it, at most one tick outside per tick of fight.
  for (let i = 0; i < F.graceTicks + 5; i++) away(world, runId);
  expect(world.getSnapshot().fishing.active!.outside).toBe(5);
  expect(tamper({})).not.toThrow();
  expect(tamper({ outside: 6 })).toThrow();
  // In and out by turns for longer than the limit: the count is below it, never at it.
  const run = () => world.getSnapshot().fishing.active!;
  const limit = F.escapeOutsideTicks[fishById(run().speciesId!).stars];
  for (let i = 0; i < 2 * limit; i++) {
    const fish = fishPoint(run(), run().phaseTick + 1);
    if (i % 2) away(world, runId);
    else tick(world, runId, fish.x, fish.y);
  }
  expect(run()).toMatchObject({ phase: 'fight', outside: 1 });
  expect(tamper({ outside: limit - 1 })).not.toThrow();
  expect(tamper({ outside: limit })).toThrow();
  // Only a motion fight counts: not a wait, nor a button run.
  const waiting = begin();
  waiting.world.dispatch({
    type: 'FISH_CAST',
    runId: waiting.runId,
    power: 60,
  });
  expect(tamper({}, waiting.world)).not.toThrow();
  expect(tamper({ outside: 1 }, waiting.world)).toThrow();
  const buttons = createWorld(42);
  buttons.dispatch({
    type: 'FISH_BEGIN',
    catId: 'mochi',
    spotId: 'POND',
    baitId: 'WORM',
    direction: 30,
    aimDepth: 50,
  });
  expect(tamper({}, buttons)).not.toThrow();
  expect(tamper({ outside: 1 }, buttons)).toThrow();
});

it('refuses a fish position before the fight starts', () => {
  const { world } = toFight();
  expect(() => fishPoint(world.getSnapshot().fishing.active!, -1)).toThrow();
});
