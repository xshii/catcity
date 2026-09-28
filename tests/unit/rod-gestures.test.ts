import { describe, expect, it } from 'vitest';
import { FISHING } from '../../src/content/fishing';
import { calibrateSwing, parseTuning } from '../../src/view/motion/calibrate';
import { createRodGestures } from '../../src/view/motion/rod';
import { createRodTip } from '../../src/view/motion/tip';

const G = FISHING.motion.gesture;
const C = G.calibration;
/** Feed pitch-rate samples 20 ms apart (positive = tip down); `power` per sample. */
function feed(
  rod: ReturnType<typeof createRodGestures>,
  rates: number[],
  want: 'cast' | 'lift',
  { start = 0, power = (i: number) => 50 + i } = {},
) {
  return rates
    .map((rate, i) =>
      rod.push(
        { t: start + i * 20, pitchRate: rate * G.pitchSign, power: power(i) },
        want,
      ),
    )
    .filter((event) => event !== null);
}

describe('rod flick and lift', () => {
  it('ignores slow pitching, which only sets the power', () => {
    expect(
      feed(createRodGestures(), [30, 60, -40, -70, 20, 60, 0], 'cast'),
    ).toEqual([]);
  });

  it('casts once on a quick flick down, with the power from just before it', () => {
    // Samples 0–4 hold still at power 70; the flick starts at sample 5.
    const power = (i: number) => (i < 5 ? 70 : 20);
    const rates = [0, 0, 0, 0, 0, 120, 320, 500, 200, 60, 0];
    expect(feed(createRodGestures(), rates, 'cast', { power })).toEqual([
      { kind: 'cast', power: 70 },
    ]);
  });

  it('does not cast on a quick move that never reaches the flick speed', () => {
    expect(
      feed(createRodGestures(), [0, 120, G.flickDegPerSec - 10, 90, 0], 'cast'),
    ).toEqual([]);
  });

  it('lifts on a quick tip-up, but not on the rebound right after a cast', () => {
    const rod = createRodGestures();
    expect(feed(rod, [0, 300, 600, 100, 0], 'cast')).toHaveLength(1);
    // The rebound of the same flick arrives as the run starts waiting.
    expect(feed(rod, [-400], 'lift', { start: 120 })).toEqual([]);
    expect(feed(rod, [-50, -100], 'lift', { start: 2000 })).toEqual([]);
    expect(feed(rod, [-400], 'lift', { start: 2100 })).toEqual([
      { kind: 'lift' },
    ]);
    expect(
      feed(rod, [-400], 'lift', { start: 2100 + G.liftCooldownMs + 20 }),
    ).toEqual([{ kind: 'lift' }]);
  });
});

describe('rod tip', () => {
  it('starts centred on the calibrated pose and spans the plane over the tilt range', () => {
    const tip = createRodTip();
    tip.calibrate({ x: 10, y: -5 });
    expect(tip.point({ x: 10, y: -5 })).toEqual({ x: 50, y: 50 });
    let point = { x: 50, y: 50 };
    for (let i = 0; i < 40; i++)
      point = tip.point({ x: 10 + G.tiltRangeDeg, y: -5 - G.tiltRangeDeg });
    expect(point).toEqual({ x: 100, y: 0 });
  });

  it('smooths jitter and clamps beyond the range', () => {
    const tip = createRodTip();
    tip.calibrate({ x: 0, y: 0 });
    const first = tip.point({ x: G.tiltRangeDeg, y: 0 });
    expect(first.x).toBeGreaterThan(50);
    expect(first.x).toBeLessThan(100);
    for (let i = 0; i < 60; i++) tip.point({ x: 90, y: 90 });
    expect(tip.point({ x: 90, y: 90 })).toEqual({ x: 100, y: 100 });
  });

  it('maps roll to the aim direction within the allowed range', () => {
    const tip = createRodTip();
    tip.calibrate({ x: 0, y: 0 });
    expect(tip.aim({ x: 0, y: 0 })).toBe(0);
    expect(tip.aim({ x: G.aimRangeDeg, y: 0 })).toBe(
      FISHING.input.maxDirection,
    );
    expect(tip.aim({ x: -3 * G.aimRangeDeg, y: 0 })).toBe(
      -FISHING.input.maxDirection,
    );
  });

  it('maps pitch back to more power and forward to less, resting at half', () => {
    const tip = createRodTip();
    tip.calibrate({ x: 0, y: 10 });
    const settle = (y: number) => {
      let power = 0;
      for (let i = 0; i < 40; i++) power = tip.power({ x: 0, y });
      return power;
    };
    expect(settle(10)).toBe(50);
    expect(settle(10 + G.powerRangeDeg)).toBe(100);
    expect(settle(10 - G.powerRangeDeg)).toBe(0);
    expect(settle(10 + 3 * G.powerRangeDeg)).toBe(100);
  });
});

describe('one-tap flick calibration', () => {
  const on = (axis: 'alpha' | 'beta' | 'gamma', rates: number[]) =>
    rates.map((rate, i) => ({
      t: i * 20,
      alpha: 0,
      beta: 0,
      gamma: 0,
      [axis]: rate,
    }));
  const quiet = Array<number>(Math.ceil(C.quietMs / 20) + 1).fill(0);
  // Two flicks down that this phone reports as negative, each with an overshoot back.
  const reversed = [
    0,
    -300,
    -500,
    -200,
    350,
    0,
    ...quiet,
    -250,
    -420,
    -100,
    300,
    0,
    ...quiet,
  ];

  it("learns the axis and sign from the flicks' first strong spike, not the rebound", () => {
    const result = calibrateSwing(on('beta', reversed))!;
    expect(result.tuning).toEqual({
      axis: 'beta',
      pitchSign: -1,
      flickDegPerSec: (420 * C.flick.percent) / 100,
      liftDegPerSec: G.liftDegPerSec,
    });
    expect(result.peak).toBe(420);
    expect(calibrateSwing(on('gamma', reversed))!.tuning.axis).toBe('gamma');
    // The tuned rod casts on such a flick.
    const rod = createRodGestures(result.tuning);
    const casts = reversed
      .slice(0, 8)
      .map((rate, i) =>
        rod.push({ t: i * 20, pitchRate: rate, power: 60 }, 'cast'),
      )
      .filter(Boolean);
    expect(casts).toEqual([{ kind: 'cast', power: 60 }]);
  });

  it('asks again when the flicks disagree, are too few or too weak', () => {
    const disagree = [0, -400, 0, ...quiet, 400, 0, ...quiet];
    expect(calibrateSwing(on('beta', disagree))).toBeNull();
    expect(calibrateSwing(on('beta', [0, -400, 0, ...quiet]))).toBeNull();
    expect(
      calibrateSwing(on('beta', [0, -100, 0, ...quiet, -120, 0, ...quiet])),
    ).toBeNull();
    expect(calibrateSwing([])).toBeNull();
  });

  it('keeps the flick threshold within bounds', () => {
    const hard = [0, -3000, 0, ...quiet, -2500, 0, ...quiet];
    expect(calibrateSwing(on('beta', hard))!.tuning.flickDegPerSec).toBe(
      C.flick.max,
    );
    const gentle = [0, -C.minFlickDegPerSec, 0, ...quiet, -160, 0, ...quiet];
    expect(calibrateSwing(on('beta', gentle))!.tuning.flickDegPerSec).toBe(
      C.flick.min,
    );
  });

  it('accepts only a well-formed stored tuning within the bounds', () => {
    const tuning = calibrateSwing(on('beta', reversed))!.tuning;
    expect(parseTuning(JSON.parse(JSON.stringify(tuning)))).toEqual(tuning);
    for (const broken of [
      null,
      'beta',
      { ...tuning, axis: 'roll' },
      { ...tuning, pitchSign: 0 },
      { ...tuning, flickDegPerSec: C.flick.max + 1 },
      { ...tuning, flickDegPerSec: Number.NaN },
      { ...tuning, liftDegPerSec: C.lift.min - 1 },
      { ...tuning, liftDegPerSec: undefined },
    ])
      expect(parseTuning(broken)).toBeNull();
  });
});
