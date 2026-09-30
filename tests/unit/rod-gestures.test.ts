import { describe, expect, it } from 'vitest';
import { FISHING } from '../../src/content/fishing';
import {
  calibrateSwing,
  parseTuning,
  rateAxesFor,
  screenRates,
} from '../../src/view/fishing/motion/calibrate';
import { createRodGestures } from '../../src/view/fishing/motion/rod';
import { centreOnPhase, createRodTip } from '../../src/view/fishing/motion/tip';

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
        { t: start + i * 20, rate: rate * G.pitchSign, power: power(i) },
        want,
      ),
    )
    .filter((event) => event !== null);
}

describe('rod flick and lift', () => {
  it('after settling, lets a flick in progress end before the next one casts', () => {
    const rod = createRodGestures();
    rod.settle();
    // Mid-flick when settled: no cast, however fast; quiet, then a new flick casts.
    expect(feed(rod, [500, 400, 200], 'cast', { power: () => 40 })).toEqual([]);
    expect(
      feed(rod, [0, 0, 120, 320, 500], 'cast', {
        start: 100,
        power: () => 40,
      }),
    ).toEqual([{ kind: 'cast', power: 40 }]);
  });

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

  it('takes the sign from the fastest spin of each flick, not a lean back or overshoot', () => {
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
      .map((rate, i) => rod.push({ t: i * 20, rate, power: 60 }, 'cast'))
      .filter(Boolean);
    expect(casts).toEqual([{ kind: 'cast', power: 60 }]);
  });

  it('reads a wind-up and a long return around the flick as parts of the same flick', () => {
    // As recorded on an iPhone: a quick lift first, the flick down, then a slower but
    // longer return that turns further than the flick did.
    const windUp = [0, 150, 320, 230, 0, -300, -560, -280, -140, 0];
    const longReturn = [110, 260, 240, 190, 140, 180, 240, 150, 0];
    const result = calibrateSwing(
      on('pitch', [
        ...windUp,
        ...longReturn,
        ...quiet,
        ...windUp,
        ...longReturn,
        ...quiet,
      ]),
    )!;
    expect(result.tuning).toMatchObject({ axis: 'pitch', pitchSign: -1 });
    expect(result.peak).toBe(560);
  });

  it('asks again when a wind-up spins nearly as fast as the flick', () => {
    // Up at 600, down at 560: which way is the flick? Better to ask again.
    const unclear = [0, 300, 600, 200, -300, -560, -200, 0];
    expect(
      calibrateSwing(on('pitch', [...unclear, ...quiet, ...unclear, ...quiet])),
    ).toBeNull();
  });

  it('takes flicks that snap back almost as fast when both point the way a flick down reads', () => {
    // As recorded on an iPhone (2026-09-30): down at 525 and 423, each springing back at
    // 93% and 87% of that. Two flicks agreeing with the axis's own down are not a wind-up.
    const snap = (peak: number, back: number) => [
      0,
      -peak / 2,
      -peak,
      0,
      back,
      0,
    ];
    const result = calibrateSwing(
      on('pitch', [...snap(525, 486), ...quiet, ...snap(423, 368), ...quiet]),
    )!;
    expect(result.tuning).toMatchObject({
      axis: 'pitch',
      pitchSign: G.pitchSign,
    });
    expect(result.peak).toBe(423);
    // On an axis with no down of its own, such flicks still ask again.
    expect(
      calibrateSwing(
        on('roll', [...snap(525, 486), ...quiet, ...snap(423, 368), ...quiet]),
      ),
    ).toBeNull();
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

  it('knows iOS browsers, iPads that report a Mac included, by their user agent', () => {
    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
    const mac =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15';
    const android =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';
    expect(rateAxesFor(iphone, 5)).toBe('webkit');
    expect(rateAxesFor(mac, 5)).toBe('webkit');
    expect(rateAxesFor(mac, 0)).toBe('standard');
    expect(rateAxesFor(android, 5)).toBe('standard');
  });

  it('reads iOS WebKit rates, which come in device x, y, z order, on the same axes', () => {
    // WebKit on iOS fills alpha, beta, gamma with rotation about x, y, z; the standard
    // puts z, x, y there. The same physical spin must give the same screen rates.
    const standard = { alpha: 5, beta: 100, gamma: 20 };
    const webkit = { alpha: 100, beta: 20, gamma: 5 };
    for (const angle of [0, 90, 270])
      expect(screenRates(webkit, angle, 'webkit')).toEqual(
        screenRates(standard, angle, 'standard'),
      );
  });
});

describe('rod tip centre on phase changes', () => {
  const still = { x: 2, y: 15 };
  const lifting = { x: 3, y: 40 };
  it('centres the fight on the pose held at the bite, not the lift', () => {
    const bite = centreOnPhase('hook', null, still);
    expect(bite).toEqual({ held: still, centre: null });
    expect(centreOnPhase('fight', bite.held, lifting)).toEqual({
      held: null,
      centre: still,
    });
  });
  it('centres on the current pose when aiming or after a reload mid-fight', () => {
    expect(centreOnPhase(null, still, lifting).centre).toBe('current');
    expect(centreOnPhase('fight', null, lifting).centre).toBe('current');
  });
  it('forgets the bite pose in any other phase', () => {
    expect(centreOnPhase('waiting', still, lifting)).toEqual({
      held: null,
      centre: null,
    });
  });
});
