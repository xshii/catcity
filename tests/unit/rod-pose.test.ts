import { describe, expect, it } from 'vitest';
import {
  ROD_MOTION,
  rodPose,
  rodShape,
  rodStance,
  type RodStance,
} from '../../src/view/art/rod-pose';

const M = ROD_MOTION;
const BASE = { x: 430, y: 640 };
const TIP = { x: 372, y: 330 };
const FLOAT = { x: 300, y: 400 };
const pose = (
  stance: RodStance,
  ms: number,
  { from = 0, pull = 0, still = false } = {},
) => rodPose({ stance, ms, from, pull }, still);
/** Every 10 ms from the change until well after the move has ended. */
const TIMES = Array.from({ length: 121 }, (_, i) => i * 10);

describe('the rod stance follows the run', () => {
  const run = (phase: string) => ({ id: 'angling-7', phase });
  const result = (caught: boolean, runId = 'angling-7') => ({ runId, caught });

  it('rests until the hook is set and stays raised through the fight', () => {
    expect(rodStance({ active: null, lastResult: null }, null)).toBe('rest');
    for (const phase of ['charge', 'waiting', 'hook'])
      expect(rodStance({ active: run(phase), lastResult: null }, null)).toBe(
        'rest',
      );
    expect(
      rodStance(
        { active: run('fight'), lastResult: result(true, 'old') },
        null,
      ),
    ).toBe('raised');
  });

  it('lands only the catch of the run it watched', () => {
    const caught = { active: null, lastResult: result(true) };
    expect(rodStance(caught, 'angling-7')).toBe('landing');
    // A save's last result from before this visit is not a landing.
    expect(rodStance(caught, null)).toBe('rest');
    expect(rodStance(caught, 'angling-8')).toBe('rest');
  });

  it('rests after an escape, a cancelled run and into the next run', () => {
    expect(
      rodStance({ active: null, lastResult: result(false) }, 'angling-7'),
    ).toBe('rest');
    // Cancelled: the result is still an older run's.
    expect(
      rodStance({ active: null, lastResult: result(true, 'old') }, 'angling-7'),
    ).toBe('rest');
    expect(
      rodStance(
        {
          active: { id: 'angling-8', phase: 'charge' },
          lastResult: result(true),
        },
        'angling-7',
      ),
    ).toBe('rest');
  });
});

describe('the rod pose over time', () => {
  it('rests flat, whatever the time or the last pull', () => {
    for (const ms of TIMES)
      expect(pose('rest', ms, { pull: 1 })).toEqual({ lift: 0, bend: 0 });
  });

  it('snaps up on the hook set, overshoots slightly and settles raised', () => {
    expect(M.set.rise).toBeGreaterThanOrEqual(150);
    expect(M.set.rise).toBeLessThanOrEqual(200);
    expect(pose('raised', 0).lift).toBe(0);
    const lifts = TIMES.map((ms) => pose('raised', ms).lift);
    const rising = lifts.filter((_, i) => TIMES[i]! <= M.set.rise);
    for (let i = 1; i < rising.length; i++)
      expect(rising[i]).toBeGreaterThan(rising[i - 1]!);
    // Ease-out: most of the way up in the first half of the rise.
    expect(pose('raised', M.set.rise / 2).lift).toBeGreaterThan(0.8);
    const peak = Math.max(...lifts);
    expect(peak).toBeCloseTo(pose('raised', M.set.rise).lift);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(1.2);
    for (const ms of TIMES.filter((ms) => ms >= M.set.rise + M.set.settle))
      expect(pose('raised', ms).lift).toBe(1);
  });

  it('bends with the pull during the fight, subtly and within bounds', () => {
    const settled = 5000;
    const bends = [0, 0.25, 0.5, 0.75, 1].map(
      (pull) => pose('raised', settled, { pull }).bend,
    );
    for (let i = 1; i < bends.length; i++)
      expect(bends[i]).toBeGreaterThan(bends[i - 1]!);
    // A hooked fish always bends the rod a little.
    expect(bends[0]).toBeGreaterThan(0);
    expect(bends.at(-1)).toBe(1);
    expect(pose('raised', settled, { pull: 3 }).bend).toBe(1);
    expect(pose('raised', settled, { pull: -1 }).bend).toBe(bends[0]);
    for (const pull of [0, 1])
      expect(pose('raised', settled, { pull }).lift).toBe(1);
  });

  it('lifts once more to land the fish, then returns to rest', () => {
    expect(M.land.rise).toBe(300);
    expect(pose('landing', 0, { from: 1 }).lift).toBe(1);
    expect(pose('landing', M.land.rise, { from: 1 }).lift).toBe(M.land.lift);
    expect(M.land.lift).toBeGreaterThan(1);
    const lifts = TIMES.map((ms) => pose('landing', ms, { from: 1 }).lift);
    expect(Math.max(...lifts)).toBe(M.land.lift);
    const peak = lifts.indexOf(M.land.lift);
    for (let i = 1; i < lifts.length; i++)
      if (i <= peak) expect(lifts[i]).toBeGreaterThan(lifts[i - 1]!);
      else expect(lifts[i]).toBeLessThanOrEqual(lifts[i - 1]!);
    for (const ms of TIMES.filter((ms) => ms >= M.land.rise + M.land.lower))
      expect(pose('landing', ms, { from: 1, pull: 1 })).toEqual({
        lift: 0,
        bend: 0,
      });
    // Something hooked without a fight (a can, a coin bag) comes out from rest.
    expect(pose('landing', M.land.rise).lift).toBe(M.land.lift);
  });

  it('eases back to rest when the fish escapes or the run is abandoned', () => {
    const lifts = TIMES.map((ms) => pose('rest', ms, { from: 1 }).lift);
    expect(lifts[0]).toBe(1);
    for (let i = 1; i < lifts.length; i++)
      expect(lifts[i]).toBeLessThanOrEqual(lifts[i - 1]!);
    for (const ms of TIMES.filter((ms) => ms >= M.rest))
      expect(pose('rest', ms, { from: 1, pull: 1 })).toEqual({
        lift: 0,
        bend: 0,
      });
  });

  it('continues from the pose it was in when the stance changes', () => {
    for (const ms of [0, 60, 180, 250, 900])
      for (const pull of [0, 0.6]) {
        const before = pose('raised', ms, { pull });
        for (const next of ['landing', 'rest'] as const)
          expect(pose(next, 0, { from: before.lift, pull })).toEqual(before);
      }
  });

  it('never runs backwards or fails on odd times', () => {
    expect(pose('raised', -50)).toEqual(pose('raised', 0));
    expect(pose('raised', Infinity, { pull: 0.5 })).toEqual(
      pose('raised', 5000, { pull: 0.5 }),
    );
    expect(pose('landing', Infinity, { from: 1 }).lift).toBe(0);
  });

  it('jumps to the final pose under reduced motion', () => {
    for (const ms of [0, 50, 180, 300, 5000]) {
      expect(pose('raised', ms, { pull: 0.5, still: true })).toEqual(
        pose('raised', Infinity, { pull: 0.5 }),
      );
      for (const stance of ['landing', 'rest'] as const)
        expect(pose(stance, ms, { from: 1, pull: 0.5, still: true })).toEqual({
          lift: 0,
          bend: 0,
        });
    }
  });
});

describe('the rod drawn from a pose', () => {
  it('is the straight rod from the dock to the tip at rest', () => {
    expect(rodShape({ lift: 0, bend: 0 }, BASE, TIP, FLOAT)).toEqual([
      BASE,
      TIP,
    ]);
  });

  it('raises the tip with the lift, from the same grip', () => {
    const tips = [0, 0.5, 1, M.land.lift].map((lift) =>
      rodShape({ lift, bend: 0 }, BASE, TIP, FLOAT).at(-1)!,
    );
    for (let i = 1; i < tips.length; i++)
      expect(tips[i]!.y).toBeLessThan(tips[i - 1]!.y);
    // Still on the canvas at the top of the landing.
    expect(tips.at(-1)!.y).toBeGreaterThan(0);
    expect(rodShape({ lift: 1, bend: 0 }, BASE, TIP, FLOAT)[0]).toEqual(BASE);
  });

  it('bends the tip toward the float, more with more bend', () => {
    const straight = rodShape({ lift: 1, bend: 0 }, BASE, TIP, FLOAT).at(-1)!;
    const distance = (bend: number, float = FLOAT) => {
      const shape = rodShape({ lift: 1, bend }, BASE, TIP, float);
      expect(shape[0]).toEqual(BASE);
      const tip = shape.at(-1)!;
      return {
        toFloat: Math.hypot(float.x - tip.x, float.y - tip.y),
        moved: Math.hypot(straight.x - tip.x, straight.y - tip.y),
        tip,
      };
    };
    expect(distance(0.5).toFloat).toBeLessThan(distance(0).toFloat);
    expect(distance(1).toFloat).toBeLessThan(distance(0.5).toFloat);
    expect(distance(1).moved).toBeCloseTo(M.bend.reach);
    // It follows the float to either side.
    expect(distance(1, { x: 100, y: 400 }).tip.x).toBeLessThan(straight.x);
    expect(distance(1, { x: 600, y: 400 }).tip.x).toBeGreaterThan(straight.x);
  });

  it('curves smoothly: it leaves the grip along the rod, in short steps', () => {
    const shape = rodShape({ lift: 1, bend: 1 }, BASE, TIP, FLOAT);
    const straight = rodShape({ lift: 1, bend: 0 }, BASE, TIP, FLOAT).at(-1)!;
    expect(shape.length).toBeGreaterThan(4);
    const angle = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.atan2(b.y - a.y, b.x - a.x);
    expect(angle(shape[0]!, shape[1]!)).toBeCloseTo(angle(BASE, straight), 1);
    for (let i = 2; i < shape.length; i++)
      expect(
        Math.abs(
          angle(shape[i - 1]!, shape[i]!) - angle(shape[i - 2]!, shape[i - 1]!),
        ),
      ).toBeLessThan(0.05);
  });
});
