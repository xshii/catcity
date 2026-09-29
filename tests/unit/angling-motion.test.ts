import { describe, expect, it } from 'vitest';
import { FISH_IDS, FISHING, fishById } from '../../src/content/fishing';
import { castAngling, initialAngling } from '../../src/minigames/angling';
import {
  fishPath,
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
      happy: false,
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

describe('fish ring fight', () => {
  const F = M.fight;
  const W = M.walk;
  const fight = (seed: number) => strikeMotionRun(toBite(cast(seed)));
  const ofStars = (run: AnglingRun, want: number): AnglingRun => ({
    ...run,
    speciesId: FISH_IDS.find((id) => fishById(id).stars === want)!,
  });
  /** Steps through settling in with the rod tip away from the water. */
  const settle = (run: AnglingRun) =>
    Array.from({ length: F.graceTicks }).reduce<AnglingRun>(
      (next) => stepMotionRun(next, null, 1),
      run,
    );
  const follow = (run: AnglingRun) =>
    stepMotionRun(run, fishPoint(run, run.phaseTick + 1), 1);
  const far = (run: AnglingRun) => {
    const fish = fishPoint(run, run.phaseTick + 1);
    return { x: fish.x > 50 ? 0 : 100, y: fish.y > 50 ? 0 : 100 };
  };

  it('holds the fish still and freezes the hold while the player settles in', () => {
    const run = fight(11);
    const still = F.graceTicks - F.rampTicks;
    expect(fishPoint(run, still)).toMatchObject({ x: 50, y: 50 });
    const settled = settle(run);
    expect(settled).toMatchObject({ phase: 'fight', hold: run.hold });
  });

  it('keeps the ring on the water and moves no faster than its pace', () => {
    for (let star = 0; star <= 5; star++)
      for (let seed = 1; seed <= 10; seed++) {
        const run = ofStars(fight(seed), star);
        const margin = F.radius[star]!.start + F.breathe.amplitude;
        const cruise =
          (W.speed[star]! * (100 + W.speedJitterPercent[star]!)) /
          100 /
          FISHING.ticksPerSecond;
        const dash =
          (W.speed[star]! * W.dash.speedPercent) / 100 / FISHING.ticksPerSecond;
        const path = fishPath(run, F.graceTicks + F.limitTicks);
        expect(path[80]).toEqual(fishPoint(run, 80));
        let previous = path[0]!;
        for (const point of path.slice(1)) {
          for (const value of [point.x, point.y]) {
            expect(value).toBeGreaterThanOrEqual(margin - 1);
            expect(value).toBeLessThanOrEqual(100 - margin + 1);
          }
          // Whole-unit rounding adds up to about one unit per axis.
          expect(
            Math.hypot(point.x - previous.x, point.y - previous.y),
          ).toBeLessThanOrEqual((point.dashing ? dash : cruise) + 1.5);
          previous = point;
        }
      }
    expect(fishPoint(fight(11), 120)).toEqual(fishPoint(fight(11), 120));
  });

  it('announces every dash before it starts', () => {
    let dashes = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const path = fishPath(
        ofStars(fight(seed), 5),
        F.graceTicks + F.limitTicks,
      );
      for (let tick = 1; tick < path.length; tick++) {
        const now = path[tick]!;
        const before = path[tick - 1]!;
        if (now.dashing && !before.dashing) {
          dashes++;
          expect(before.warning).toBe(true);
        }
      }
    }
    expect(dashes).toBeGreaterThan(0);
  });

  it('shrinks the ring as the hold fills and grows it back as the hold drains', () => {
    const run = settle(fight(11));
    const size = F.radius[stars(run)];
    const target = F.holdTicks[stars(run)];
    const at = (hold: number) => ringRadius({ ...run, hold });
    expect(at(target / 2)).toBeLessThan(at(0));
    expect(at(target - 1)).toBeLessThan(at(target / 2));
    expect(at(target - 1)).toBeGreaterThanOrEqual(size.min);
    expect(at(0)).toBeLessThanOrEqual(size.start + F.breathe.amplitude);
  });

  it('lands the fish after enough time inside, counted after settling in', () => {
    let run = settle(fight(11));
    const need = F.holdTicks[stars(run)];
    for (let i = 0; i < 2 * need && run.phase === 'fight'; i++)
      run = follow(run);
    expect(run.phase).toBe('caught');
    expect(run.phaseTick).toBeLessThanOrEqual(F.graceTicks + need);
  });

  it('loses twice what staying earns and lets the fish escape at the limit', () => {
    let run = follow(follow(settle(fight(11))));
    const held = run.hold;
    run = stepMotionRun(run, far(run), 1);
    expect(run.hold).toBe(held - F.hold.outsideLoss);
    while (run.phase === 'fight') run = stepMotionRun(run, far(run), 1);
    expect(run).toMatchObject({ phase: 'escaped', reason: 'escaped' });
    expect(run.phaseTick).toBe(F.graceTicks + F.limitTicks);
  });

  it('never lands a fish that drifts in and out of the ring half the time', () => {
    let run = settle(fight(11));
    const start = run.hold;
    for (let i = 0; i < 60 && run.phase === 'fight'; i++)
      run = i % 2 ? stepMotionRun(run, far(run), 1) : follow(run);
    expect(run.phase).toBe('fight');
    expect(run.hold).toBeLessThanOrEqual(start);
  });

  it('gives the same state for chunked and single ticks', () => {
    const start = fight(11);
    let single = start;
    let chunked = start;
    for (let i = 0; i < 40; i++) {
      const point = { x: 40 + (i % 20), y: 50 };
      single = stepMotionRun(stepMotionRun(single, point, 1), point, 1);
      chunked = stepMotionRun(chunked, point, 2);
    }
    expect(chunked).toEqual(single);
  });

  /** A settled 5★ fight one tick before its fish's first dash, with some line tension. */
  function beforeDash(seed: number) {
    let run = settle(ofStars(fight(seed), 5));
    const path = fishPath(run, F.graceTicks + F.limitTicks);
    const at = path.findIndex(
      (fish, tick) => tick > run.phaseTick && fish.dashing,
    );
    while (run.phaseTick < at - 1) run = stepMotionRun(run, null, 1);
    return { run: { ...run, tension: 50 }, fish: path[at]! };
  }

  it('starts the line slack and keeps it slack while settling in', () => {
    const run = ofStars(fight(11), 5);
    expect(run.tension).toBe(0);
    expect(settle(run).tension).toBe(0);
  });

  it('tightens the line while a dash pulls unless the rod tip is behind the fish', () => {
    const { run, fish } = beforeDash(3);
    const rise = F.tug.risePerTick[5];
    const margin = F.tug.marginUnits;
    const at = (point: { x: number; y: number } | null) =>
      stepMotionRun(run, point, 1).tension;
    expect(at({ x: fish.x, y: fish.y })).toBe(run.tension + rise);
    expect(at(null)).toBe(run.tension + rise);
    // Behind means nearer the player (larger plane y) by more than the margin.
    expect(at({ x: fish.x, y: fish.y + margin })).toBe(run.tension + rise);
    expect(at({ x: fish.x, y: fish.y + margin + 1 })).toBe(run.tension);
  });

  it('eases the line between dashes', () => {
    const run = { ...settle(fight(11)), tension: 10 };
    const next = follow(run);
    expect(fishPoint(run, next.phaseTick).dashing).toBe(false);
    expect(next.tension).toBe(10 - F.tug.easePerTick);
    expect(follow({ ...run, tension: 0 }).tension).toBe(0);
  });

  it('snaps the line when the tension fills', () => {
    const { run, fish } = beforeDash(3);
    const full = { ...run, tension: 100 - F.tug.risePerTick[5] };
    expect(stepMotionRun(full, { x: fish.x, y: fish.y }, 1)).toMatchObject({
      phase: 'escaped',
      reason: 'line-break',
      tension: 100,
    });
  });

  it('pulls harder and dashes more often on higher-star fish', () => {
    for (let star = 1; star <= 5; star++) {
      expect(F.tug.risePerTick[star]).toBeGreaterThanOrEqual(
        F.tug.risePerTick[star - 1]!,
      );
      expect(W.dash.perSecondPercent[star]).toBeGreaterThanOrEqual(
        W.dash.perSecondPercent[star - 1]!,
      );
    }
    expect(F.tug.risePerTick[5]).toBeGreaterThan(F.tug.risePerTick[1]);
  });

  it('gives the same tension for chunked and single ticks through dashes', () => {
    const start = ofStars(fight(3), 5);
    let single = start;
    let chunked = start;
    let tightest = 0;
    for (let i = 0; i < 120; i++) {
      const point = { x: 50, y: 20 + (i % 60) };
      single = stepMotionRun(stepMotionRun(single, point, 1), point, 1);
      chunked = stepMotionRun(chunked, point, 2);
      tightest = Math.max(tightest, single.tension);
    }
    expect(tightest).toBeGreaterThan(0);
    expect(chunked).toEqual(single);
  });

  it('settles supplies on the lift without a fight', () => {
    const loot = Array.from({ length: 80 }, (_, i) =>
      castAngling(
        initialAngling({
          happy: false,
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
