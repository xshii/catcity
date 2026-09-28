import { FISHING } from '../../content/fishing';
import { DEFAULT_TUNING, type RodTuning } from './rod';

const G = FISHING.motion.gesture;
const C = G.calibration;
const AXES = ['alpha', 'beta', 'gamma'] as const;

/** One gyroscope reading, °/s about each device axis (missing axes read 0). */
export interface SpinSample {
  t: number;
  alpha: number;
  beta: number;
  gamma: number;
}

/**
 * The flicks on one axis: each starts at the first spin of at least `minFlickDegPerSec`,
 * takes its sign from that spike (the rebound comes later) and ends after `quietMs`
 * below the onset speed. `peak` is the fastest spin in the flick's own direction.
 */
function flicksOn(samples: SpinSample[], axis: RodTuning['axis']) {
  const flicks: { sign: 1 | -1; peak: number }[] = [];
  let current: {
    sign: 1 | -1;
    peak: number;
    quietSince: number | null;
  } | null = null;
  for (const sample of samples) {
    const rate = sample[axis];
    if (!current) {
      if (Math.abs(rate) >= C.minFlickDegPerSec)
        current = { sign: rate > 0 ? 1 : -1, peak: 0, quietSince: null };
      else continue;
    }
    current.peak = Math.max(current.peak, rate * current.sign);
    if (Math.abs(rate) >= G.onsetDegPerSec) current.quietSince = null;
    else current.quietSince ??= sample.t;
    if (
      current.quietSince !== null &&
      sample.t - current.quietSince >= C.quietMs
    ) {
      flicks.push({ sign: current.sign, peak: current.peak });
      current = null;
    }
  }
  if (current) flicks.push({ sign: current.sign, peak: current.peak });
  return flicks;
}

/**
 * One-tap flick calibration (spec 030): the player flicks the tip down twice. The axis
 * with the fastest spin is the rod's; both flicks must agree on the sign, and the flick
 * threshold follows the weaker one. Null when that did not happen: ask again.
 */
export function calibrateSwing(
  samples: SpinSample[],
): { tuning: RodTuning; peak: number } | null {
  let axis: RodTuning['axis'] = G.axis;
  let fastest = 0;
  for (const candidate of AXES)
    for (const sample of samples)
      if (Math.abs(sample[candidate]) > fastest) {
        fastest = Math.abs(sample[candidate]);
        axis = candidate;
      }
  const flicks = flicksOn(samples, axis);
  if (
    flicks.length < C.flicks ||
    flicks.some((flick) => flick.sign !== flicks[0]!.sign)
  )
    return null;
  // A flick down reads `sign`, so down × pitchSign is positive.
  const pitchSign = flicks[0]!.sign;
  const peak = Math.round(Math.min(...flicks.map((flick) => flick.peak)));
  const flickDegPerSec = Math.min(
    C.flick.max,
    Math.max(C.flick.min, Math.round((peak * C.flick.percent) / 100)),
  );
  return {
    tuning: {
      axis,
      pitchSign,
      flickDegPerSec,
      liftDegPerSec: DEFAULT_TUNING.liftDegPerSec,
    },
    peak,
  };
}

const within = (value: unknown, bounds: { min: number; max: number }) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= bounds.min &&
  value <= bounds.max;

/** A stored tuning, or null if it is not one (per-device data, never trusted blindly). */
export function parseTuning(value: unknown): RodTuning | null {
  if (typeof value !== 'object' || value === null) return null;
  const tuning = value as Record<string, unknown>;
  if (
    !AXES.includes(tuning.axis as RodTuning['axis']) ||
    (tuning.pitchSign !== 1 && tuning.pitchSign !== -1) ||
    !within(tuning.flickDegPerSec, C.flick) ||
    !within(tuning.liftDegPerSec, C.lift)
  )
    return null;
  return {
    axis: tuning.axis as RodTuning['axis'],
    pitchSign: tuning.pitchSign,
    flickDegPerSec: tuning.flickDegPerSec as number,
    liftDegPerSec: tuning.liftDegPerSec as number,
  };
}
