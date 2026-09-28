import { describe, expect, it } from 'vitest';
import { FISHING, fishById } from '../../src/content/fishing';
import { castAngling, initialAngling } from '../../src/minigames/angling';
import {
  fishPoint,
  motionSchedule,
  ringRadius,
  stepMotionRun,
  strikeMotionRun,
} from '../../src/minigames/angling-motion';
import type { AnglingRun } from '../../src/minigames/angling';

const M = FISHING.motion;

/** A motion run cast at the pond; `direction` picks silver (left) or crucian. */
function cast(seed: number, direction = 30, power = 60): AnglingRun {
  return castAngling(
    initialAngling({
      id: 'angling-1',
      catId: 'mochi',
      seed,
      baitId: 'WORM',
      direction,
      aimDepth: 50,
      skillLevel: 1,
      spotId: 'POND',
      catBreed: 'RAGDOLL',
      mode: 'motion',
    }),
    power,
  );
}
const stars = (run: AnglingRun) => fishById(run.speciesId!).stars;
const wait = (run: AnglingRun, ticks: number) =>
  Array.from({ length: ticks }).reduce<AnglingRun>(
    (next) => stepMotionRun(next, null, 1),
    run,
  );
const toBite = (run: AnglingRun) =>
  wait(run, motionSchedule(run).bite - run.phaseTick);

describe('motion bite schedule', () => {
  it('is reproducible and keeps fake nibbles within the star range', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const run = cast(seed);
      expect(motionSchedule(run)).toEqual(motionSchedule(cast(seed)));
      const { nibbles, bite } = motionSchedule(run);
      const [min, max] = M.nibbles[stars(run)];
      expect(nibbles.length).toBeGreaterThanOrEqual(min);
      expect(nibbles.length).toBeLessThanOrEqual(max);
      expect([...nibbles].sort((a, b) => a - b)).toEqual(nibbles);
      expect(bite).toBeGreaterThan(nibbles.at(-1) ?? 0);
    }
  });

  it('opens the strike window at the bite and escapes after it closes', () => {
    const run = toBite(cast(7));
    expect(run.phase).toBe('hook');
    const window = M.strikeWindowTicks[stars(run)];
    const late = wait(run, window);
    expect(late).toMatchObject({ phase: 'escaped', reason: 'missed-hook' });
  });

  it('rates a quick lift perfect and a later lift good', () => {
    const bite = toBite(cast(7));
    const window = M.strikeWindowTicks[stars(bite)];
    const perfect = strikeMotionRun(bite);
    expect(perfect).toMatchObject({ phase: 'fight', strike: 'perfect' });
    const good = strikeMotionRun(wait(bite, window - 1));
    expect(good).toMatchObject({ phase: 'fight', strike: 'good' });
    expect(perfect.hold).toBeGreaterThan(0);
    expect(good.hold).toBe(0);
  });

  it('spooks the fish when lifting on a nibble; lifting while idle changes nothing', () => {
    const seed = Array.from({ length: 60 }, (_, i) => i + 1).find(
      (candidate) => motionSchedule(cast(candidate)).nibbles.length > 0,
    )!;
    const run = cast(seed);
    const { nibbles, bite } = motionSchedule(run);
    expect(strikeMotionRun(run)).toEqual(run);
    const onNibble = wait(run, nibbles[0]!);
    const spooked = strikeMotionRun(onNibble);
    expect(spooked).toMatchObject({ phase: 'waiting', spooked: true });
    expect(motionSchedule(spooked).bite).toBe(bite + M.spook.delayTicks);
  });
});

describe('fish circle fight', () => {
  const fight = (seed: number) => strikeMotionRun(toBite(cast(seed)));

  it('keeps the fish on the water and moves it no faster than its star speed', () => {
    const run = fight(11);
    const perTick = M.fishSpeed[stars(run)] / FISHING.ticksPerSecond;
    let previous = fishPoint(run, 0);
    for (let tick = 1; tick <= M.fightLimitTicks[stars(run)]; tick++) {
      const point = fishPoint(run, tick);
      for (const value of [point.x, point.y]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
      // Bursts double the speed; rounding to whole units adds up to one unit.
      expect(
        Math.hypot(point.x - previous.x, point.y - previous.y),
      ).toBeLessThanOrEqual(perTick * 2 + 1.5);
      previous = point;
    }
    expect(fishPoint(run, 50)).toEqual(fishPoint(fight(11), 50));
  });

  it('breathes the ring around a shrinking size that never drops below its minimum', () => {
    const run = fight(11);
    const size = M.radius[stars(run)];
    expect(ringRadius(run, 0)).toBe(size.start);
    for (let tick = 0; tick <= M.fightLimitTicks[stars(run)]; tick++)
      expect(ringRadius(run, tick)).toBeGreaterThanOrEqual(size.min);
    expect(ringRadius(run, M.fightLimitTicks[stars(run)])).toBeLessThan(
      size.start,
    );
  });

  it('lands the fish after enough time inside the ring', () => {
    let run = fight(11);
    const need = M.holdTicks[stars(run)];
    for (let tick = 0; tick < 2 * need && run.phase === 'fight'; tick++)
      run = stepMotionRun(run, fishPoint(run, run.phaseTick + 1), 1);
    expect(run.phase).toBe('caught');
    expect(run.phaseTick).toBeLessThanOrEqual(need);
  });

  it('decays time outside the ring and lets the fish escape at the limit', () => {
    let run = fight(11);
    const limit = M.fightLimitTicks[stars(run)];
    run = stepMotionRun(run, fishPoint(run, 1), 1);
    run = stepMotionRun(run, fishPoint(run, 2), 1);
    const held = run.hold;
    const far = (at: number) => {
      const fish = fishPoint(run, at);
      return { x: fish.x > 50 ? 0 : 100, y: fish.y > 50 ? 0 : 100 };
    };
    run = stepMotionRun(run, far(3), 1);
    expect(run.hold).toBe(held - M.hold.outsideLoss);
    while (run.phase === 'fight')
      run = stepMotionRun(run, far(run.phaseTick + 1), 1);
    expect(run).toMatchObject({ phase: 'escaped', reason: 'escaped' });
    expect(run.phaseTick).toBe(limit);
  });

  it('never lands a fish that drifts in and out of the ring half the time', () => {
    let run = fight(11);
    const start = run.hold;
    const far = (at: number) => {
      const fish = fishPoint(run, at);
      return { x: fish.x > 50 ? 0 : 100, y: fish.y > 50 ? 0 : 100 };
    };
    for (let i = 0; i < 40 && run.phase === 'fight'; i++) {
      const at = run.phaseTick + 1;
      run = stepMotionRun(run, i % 2 ? far(at) : fishPoint(run, at), 1);
    }
    expect(run.phase).toBe('fight');
    expect(run.hold).toBeLessThanOrEqual(start);
  });

  it('gives the same state for chunked and single ticks', () => {
    const start = fight(11);
    let single = start;
    let chunked = start;
    for (let i = 0; i < 20; i++) {
      const point = { x: 40 + i, y: 50 };
      single = stepMotionRun(stepMotionRun(single, point, 1), point, 1);
      chunked = stepMotionRun(chunked, point, 2);
    }
    expect(chunked).toEqual(single);
  });

  it('settles supplies on the lift without a fight', () => {
    const loot = Array.from({ length: 80 }, (_, i) =>
      castAngling(
        initialAngling({
          id: 'angling-1',
          catId: 'mochi',
          seed: i + 1,
          baitId: 'BREAD',
          direction: 0,
          aimDepth: 50,
          skillLevel: 1,
          spotId: 'POND',
          catBreed: 'RAGDOLL',
          mode: 'motion',
        }),
        10,
      ),
    ).find((run) => run.catchKind !== 'fish')!;
    const landed = strikeMotionRun(toBite(loot));
    expect(landed.phase).toBe('caught');
  });
});
