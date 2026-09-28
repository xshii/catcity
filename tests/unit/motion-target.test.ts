import { expect, it } from 'vitest';
import { FISH_IDS, fishById } from '../../src/content/fish';
import {
  greenZone,
  initialAngling,
  motionTarget,
  stepAngling,
  stepMotionAngling,
  type AnglingRun,
} from '../../src/minigames/angling';

function hook(): AnglingRun {
  return {
    ...initialAngling({
      id: 'angling-1',
      catId: 'mochi',
      catBreed: 'RAGDOLL',
      seed: 42,
      baitId: 'WORM',
      direction: 0,
      aimDepth: 50,
      skillLevel: 1,
      spotId: 'POND',
    }),
    phase: 'hook',
    hasHeld: true,
    speciesId: 'CRUCIAN',
  };
}

it('exposes the same circle difficulty to View and Core across all species', () => {
  for (const speciesId of FISH_IDS) {
    const run = { ...hook(), speciesId };
    const target = motionTarget(run);
    const zone = greenZone(run);
    expect(target).toEqual({
      x: 50,
      y: 50,
      radius: (zone.high - zone.low) / 2,
      holdTicks: 6 + 2 * fishById(speciesId).stars,
    });
    expect(motionTarget({ ...run, precision: true }).radius).toBeGreaterThan(
      target.radius,
    );
    expect(motionTarget({ ...run, skillLevel: 10 }).radius).toBeGreaterThan(
      target.radius,
    );
    let current: AnglingRun = run;
    for (let tick = 1; tick < target.holdTicks; tick++) {
      current = stepMotionAngling(current, 50, 50, 1);
      expect(current.phase).toBe('hook');
    }
    expect(stepMotionAngling(current, 50, 50, 1).phase).toBe('fight');
  }
  const easy = motionTarget({ ...hook(), speciesId: 'SILVER' });
  const hard = motionTarget({ ...hook(), speciesId: 'MOON_CARP' });
  expect(hard.radius).toBeLessThan(easy.radius);
  expect(hard.holdTicks).toBeGreaterThan(easy.holdTicks);
});

it('stops a batched motion input at the phase boundary without free fight ticks', () => {
  const input = hook();
  const count = motionTarget(input).holdTicks - 1;
  const almost = {
    ...input,
    motionStableTicks: count,
    phaseTick: count,
    tick: count + 30,
  };
  const frozen = Object.freeze(almost);
  const next = stepMotionAngling(frozen, 50, 50, 4);
  expect(next).toMatchObject({
    phase: 'fight',
    phaseTick: 0,
    motionStableTicks: 0,
    progress: 0,
    tick: frozen.tick + 1,
  });
  expect(frozen.phase).toBe('hook');
  expect(frozen.motionStableTicks).toBe(count);
});

it('applies the same expired hook deadline to a manual fallback press', () => {
  const run = {
    ...hook(),
    tick: 160,
    phaseTick: 127,
    cursor: 55,
    motionStableTicks: 3,
  };
  expect(stepAngling(run, true, 1)).toMatchObject({
    phase: 'escaped',
    reason: 'missed-hook',
    motionStableTicks: 0,
  });
});

it('rejects malformed pure inputs and inputs outside the hook phase', () => {
  const run = hook();
  for (const [x, y, ticks] of [
    [-1, 50, 1],
    [101, 50, 1],
    [50, NaN, 1],
    [50, 2.5, 1],
    [50, 50, 0],
    [50, 50, 5],
    [50, 50, 1.5],
  ]) {
    expect(() => stepMotionAngling(run, x!, y!, ticks!)).toThrow();
  }
  expect(() =>
    stepMotionAngling({ ...run, phase: 'fight' }, 50, 50, 1),
  ).toThrow();
});
