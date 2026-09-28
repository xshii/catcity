import { describe, expect, it } from 'vitest';
import { FISHING } from '../../src/content/fishing';
import { createRodGestures } from '../../src/view/motion/rod';
import { createRodTip } from '../../src/view/motion/tip';

const G = FISHING.motion.gesture;
/** Feed pitch-rate samples 20 ms apart; positive rate swings the tip forward/down. */
function feed(
  rod: ReturnType<typeof createRodGestures>,
  rates: number[],
  want: 'cast' | 'lift',
  start = 0,
) {
  return rates
    .map((rate, i) =>
      rod.push({ t: start + i * 20, pitchRate: rate * G.pitchSign }, want),
    )
    .filter((event) => event !== null);
}

describe('rod swing and lift', () => {
  it('casts on a backswing followed by a forward whip, scaling power with speed', () => {
    const soft = feed(
      createRodGestures(),
      [-200, -150, 0, 300, 320, 100],
      'cast',
    );
    const hard = feed(
      createRodGestures(),
      [-200, -150, 0, 700, 950, 200],
      'cast',
    );
    expect(soft).toEqual([{ kind: 'cast', power: expect.any(Number) }]);
    expect(hard).toEqual([{ kind: 'cast', power: 100 }]);
    const softPower = (soft[0] as { power: number }).power;
    expect(softPower).toBeGreaterThanOrEqual(G.minPower);
    expect(softPower).toBeLessThan(100);
  });

  it('ignores a forward whip without a backswing, or one that comes too late', () => {
    expect(feed(createRodGestures(), [0, 600, 800, 100], 'cast')).toEqual([]);
    const late = [-200, ...Array(40).fill(0), 800, 100];
    expect(feed(createRodGestures(), late, 'cast')).toEqual([]);
  });

  it('lifts once on a quick tip-up and ignores slow drift', () => {
    const rod = createRodGestures();
    expect(feed(rod, [-50, -100, -80], 'lift')).toEqual([]);
    expect(feed(rod, [-350, -400, -380, -350], 'lift', 1000)).toEqual([
      { kind: 'lift' },
    ]);
    // A second flick after the cooldown lifts again.
    expect(feed(rod, [-400], 'lift', 1000 + G.liftCooldownMs + 100)).toEqual([
      { kind: 'lift' },
    ]);
  });

  it('does not treat a backswing as a lift while waiting to cast', () => {
    expect(feed(createRodGestures(), [-400, -400, 0], 'cast')).toEqual([]);
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
});
