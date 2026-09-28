import { FISHING } from '../../content/fishing';
import type { RodTuning } from './rod';

const C = FISHING.motion.gesture.calibration;
const AXES = ['alpha', 'beta', 'gamma'] as const;

/** One gyroscope reading, °/s about each device axis (missing axes read 0). */
export interface SpinSample {
  t: number;
  alpha: number;
  beta: number;
  gamma: number;
}

const share = (
  peak: number,
  rule: { percent: number; min: number; max: number },
) =>
  Math.min(
    rule.max,
    Math.max(rule.min, Math.round((peak * rule.percent) / 100)),
  );

/**
 * One-tap swing calibration (spec 030). The whip is the fastest spin in the samples: its
 * axis and sign become the rod's, and the fastest opposite spin before it is the
 * backswing. Thresholds follow the player's own speeds. Null when no real swing was felt.
 */
export function calibrateSwing(
  samples: SpinSample[],
): { tuning: RodTuning; peaks: { backswing: number; forward: number } } | null {
  let found: { axis: RodTuning['axis']; index: number; rate: number } = {
    axis: 'beta',
    index: -1,
    rate: 0,
  };
  for (const axis of AXES)
    for (const [index, sample] of samples.entries())
      if (Math.abs(sample[axis]) > Math.abs(found.rate))
        found = { axis, index, rate: sample[axis] };
  if (Math.abs(found.rate) < C.minForwardDegPerSec) return null;
  const pitchSign = found.rate > 0 ? 1 : -1;
  const forward = Math.abs(found.rate);
  const backswing = Math.max(
    0,
    ...samples
      .slice(0, found.index)
      .map((sample) => -sample[found.axis] * pitchSign),
  );
  return {
    tuning: {
      axis: found.axis,
      pitchSign,
      forwardDegPerSec: share(forward, C.forward),
      backswingDegPerSec: share(backswing, C.backswing),
      fullPowerDegPerSec: share(forward, C.fullPower),
      liftDegPerSec: share(backswing, C.lift),
    },
    peaks: { backswing: Math.round(backswing), forward: Math.round(forward) },
  };
}

/** A stored tuning, or null if it is not one (per-device data, never trusted blindly). */
export function parseTuning(value: unknown): RodTuning | null {
  if (typeof value !== 'object' || value === null) return null;
  const tuning = value as Record<string, unknown>;
  const speeds = [
    'backswingDegPerSec',
    'forwardDegPerSec',
    'fullPowerDegPerSec',
    'liftDegPerSec',
  ] as const;
  const valid =
    AXES.includes(tuning.axis as RodTuning['axis']) &&
    (tuning.pitchSign === 1 || tuning.pitchSign === -1) &&
    speeds.every(
      (key) =>
        typeof tuning[key] === 'number' &&
        Number.isFinite(tuning[key]) &&
        tuning[key] > 0,
    );
  if (!valid) return null;
  return {
    axis: tuning.axis as RodTuning['axis'],
    pitchSign: tuning.pitchSign as RodTuning['pitchSign'],
    backswingDegPerSec: tuning.backswingDegPerSec as number,
    forwardDegPerSec: tuning.forwardDegPerSec as number,
    fullPowerDegPerSec: tuning.fullPowerDegPerSec as number,
    liftDegPerSec: tuning.liftDegPerSec as number,
  };
}
