import { describe, expect, it } from 'vitest';
import { FISHING } from '../../src/content/fishing';
import {
  calibrateSwing,
  parseTuning,
  screenRates,
} from '../../src/view/motion/calibrate';
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

  it('reads the power when the push starts, even if it speeds up slowly', () => {
    // A push above the onset speed for 300 ms, then the flick; power sags meanwhile.
    const rates = [0, 0, 0, 0, 0, ...Array<number>(15).fill(120), 500, 0];
    const power = (i: number) => (i < 5 ? 80 : 80 - (i - 4));
    expect(feed(createRodGestures(), rates, 'cast', { power })).toEqual([
      { kind: 'cast', power: 80 },
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
  const on = (axis: 'pitch' | 'roll' | 'yaw', rates: number[]) =>
    rates.map((rate, i) => ({
      t: i * 20,
      pitch: 0,
      roll: 0,
      yaw: 0,
      [axis]: rate,
    }));
  const quiet = Array<number>(Math.ceil(C.quietMs / 20) + 1).fill(0);
  // This phone reports a flick down as negative: a small lean back first, the flick,
  // an overshoot, then a slow return to the resting pose.
  const flick = (peak: number) => [0, 200, 120, -300, -peak, -200, 250, 0];
  const settleBack = [0, 160, 200, 160, 0];
  const twice = [
    ...flick(500),
    ...quiet,
    ...settleBack,
    ...quiet,
    ...flick(420),
    ...quiet,
    ...settleBack,
    ...quiet,
  ];

  it('takes the sign from the net turn of each flick, not a lean back or overshoot', () => {
    const result = calibrateSwing(on('pitch', twice))!;
    expect(result.tuning).toEqual({
      axis: 'pitch',
      pitchSign: -1,
      flickDegPerSec: (420 * C.flick.percent) / 100,
      liftDegPerSec: (420 * C.lift.percent) / 100,
    });
    expect(result.peak).toBe(420);
    expect(calibrateSwing(on('roll', twice))!.tuning.axis).toBe('roll');
    // The tuned rod casts on such a flick.
    const rod = createRodGestures(result.tuning);
    const casts = flick(500)
      .map((rate, i) =>
        rod.push({ t: i * 20, pitchRate: rate, power: 60 }, 'cast'),
      )
      .filter(Boolean);
    expect(casts).toEqual([{ kind: 'cast', power: 60 }]);
  });

  it('asks again when the two strongest flicks disagree, or there are too few', () => {
    const disagree = [...flick(500), ...quiet, ...flick(-500), ...quiet];
    expect(calibrateSwing(on('pitch', disagree))).toBeNull();
    expect(calibrateSwing(on('pitch', [...flick(500), ...quiet]))).toBeNull();
    expect(
      calibrateSwing(on('pitch', [0, -100, 0, ...quiet, -120, 0, ...quiet])),
    ).toBeNull();
    expect(calibrateSwing([])).toBeNull();
  });

  it('keeps thresholds within bounds, high enough that a tap cannot cast', () => {
    const hard = [0, -3000, 0, ...quiet, -2500, 0, ...quiet];
    const strong = calibrateSwing(on('pitch', hard))!.tuning;
    expect(strong.flickDegPerSec).toBe(C.flick.max);
    expect(strong.liftDegPerSec).toBe(C.lift.max);
    const gentle = [0, -C.minFlickDegPerSec, 0, ...quiet, -160, 0, ...quiet];
    const soft = calibrateSwing(on('pitch', gentle))!.tuning;
    expect(soft.flickDegPerSec).toBe(C.flick.min);
    expect(soft.liftDegPerSec).toBe(C.lift.min);
    expect(C.flick.min).toBeGreaterThanOrEqual(180);
  });

  it('accepts only a well-formed stored tuning within the bounds', () => {
    const tuning = calibrateSwing(on('pitch', twice))!.tuning;
    expect(parseTuning(JSON.parse(JSON.stringify(tuning)))).toEqual(tuning);
    for (const broken of [
      null,
      'pitch',
      { ...tuning, axis: 'beta' },
      { ...tuning, pitchSign: 0 },
      { ...tuning, flickDegPerSec: C.flick.max + 1 },
      { ...tuning, flickDegPerSec: Number.NaN },
      { ...tuning, liftDegPerSec: C.lift.min - 1 },
      { ...tuning, liftDegPerSec: undefined },
    ])
      expect(parseTuning(broken)).toBeNull();
  });
});

describe('screen-frame rotation rates', () => {
  it('turns device rates into pitch, roll and yaw of the screen as held', () => {
    const rate = { alpha: 5, beta: 100, gamma: 20 };
    expect(screenRates(rate, 0)).toEqual({ pitch: 100, roll: 20, yaw: 5 });
    const landscape = screenRates(rate, 90);
    expect(landscape.pitch).toBeCloseTo(20);
    expect(landscape.roll).toBeCloseTo(-100);
    expect(screenRates(null, 0)).toEqual({ pitch: 0, roll: 0, yaw: 0 });
  });
});
