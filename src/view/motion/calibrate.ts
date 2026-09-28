import { FISHING } from '../../content/fishing';
import type { RodTuning } from './rod';

const G = FISHING.motion.gesture;
const C = G.calibration;
const AXES = ['pitch', 'roll', 'yaw'] as const;

/** One gyroscope reading, °/s about the screen's pitch, roll and yaw axes as held. */
export interface SpinSample {
  t: number;
  pitch: number;
  roll: number;
  yaw: number;
}

/**
 * Device rotation rates turned into the screen's axes, like the tilt: pitch tips the top
 * toward or away from the player, roll tilts it sideways, yaw turns it flat.
 */
export function screenRates(
  rate: {
    alpha: number | null;
    beta: number | null;
    gamma: number | null;
  } | null,
  screenAngle: number,
): Omit<SpinSample, 't'> {
  const radians = (screenAngle * Math.PI) / 180;
  const beta = rate?.beta ?? 0;
  const gamma = rate?.gamma ?? 0;
  return {
    pitch: beta * Math.cos(radians) + gamma * Math.sin(radians),
    roll: gamma * Math.cos(radians) - beta * Math.sin(radians),
    yaw: rate?.alpha ?? 0,
  };
}

/**
 * The flicks on one axis: each starts at a spin of at least `minFlickDegPerSec` and ends
 * after `quietMs` below the onset speed. Its sign is its net turn, so a lean back before
 * it or an overshoot after it cannot flip it; `peak` is the fastest spin that way.
 */
function flicksOn(samples: SpinSample[], axis: RodTuning['axis']) {
  const flicks: { sign: 1 | -1; peak: number }[] = [];
  let current: {
    rates: number[];
    turn: number;
    quietSince: number | null;
  } | null = null;
  let previous: number | null = null;
  const close = () => {
    if (!current) return;
    const sign = current.turn >= 0 ? 1 : -1;
    flicks.push({
      sign,
      peak: Math.max(...current.rates.map((rate) => rate * sign)),
    });
    current = null;
  };
  for (const sample of samples) {
    const rate = sample[axis];
    const dt = previous === null ? 0 : sample.t - previous;
    previous = sample.t;
    if (!current) {
      if (Math.abs(rate) < C.minFlickDegPerSec) continue;
      current = { rates: [], turn: 0, quietSince: null };
    }
    current.rates.push(rate);
    current.turn += rate * Math.max(dt, 1);
    if (Math.abs(rate) >= G.onsetDegPerSec) current.quietSince = null;
    else current.quietSince ??= sample.t;
    if (
      current.quietSince !== null &&
      sample.t - current.quietSince >= C.quietMs
    )
      close();
  }
  close();
  return flicks;
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
 * One-tap flick calibration (spec 030): the player flicks the tip down twice. The axis
 * with the fastest spin is the rod's; the two strongest flicks must agree (slower moves
 * such as settling back are ignored), and the thresholds follow the weaker of the two.
 * Null when that did not happen: ask again.
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
  const strongest = flicksOn(samples, axis)
    .sort((a, b) => b.peak - a.peak)
    .slice(0, C.flicks);
  if (
    strongest.length < C.flicks ||
    strongest.some((flick) => flick.sign !== strongest[0]!.sign)
  )
    return null;
  const peak = Math.round(Math.min(...strongest.map((flick) => flick.peak)));
  return {
    tuning: {
      axis,
      // A flick down reads `sign`, so down × pitchSign is positive.
      pitchSign: strongest[0]!.sign,
      flickDegPerSec: share(peak, C.flick),
      liftDegPerSec: share(peak, C.lift),
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
