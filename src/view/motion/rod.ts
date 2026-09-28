import { FISHING } from '../../content/fishing';

const G = FISHING.motion.gesture;

export interface RodSample {
  /** Milliseconds, monotonic (event timestamps). */
  t: number;
  /** Gyroscope rate about the tuned axis, °/s, as reported by the device. */
  pitchRate: number;
}
export type RodEvent = { kind: 'cast'; power: number } | { kind: 'lift' };

/** Which rate axis is the rod's pitch, its sign, and the speeds that count (°/s). */
export interface RodTuning {
  axis: 'alpha' | 'beta' | 'gamma';
  pitchSign: 1 | -1;
  backswingDegPerSec: number;
  forwardDegPerSec: number;
  fullPowerDegPerSec: number;
  liftDegPerSec: number;
}
export const DEFAULT_TUNING: RodTuning = {
  axis: G.axis,
  pitchSign: G.pitchSign,
  backswingDegPerSec: G.backswingDegPerSec,
  forwardDegPerSec: G.forwardDegPerSec,
  fullPowerDegPerSec: G.fullPowerDegPerSec,
  liftDegPerSec: G.liftDegPerSec,
};

/**
 * Phone-as-rod gestures (spec 030). Pure: fed samples and timestamps, it reports a cast
 * (backswing then forward whip; power from the whip's peak rate) or a quick tip-up lift.
 * `want` scopes recognition to the phase, so a backswing is never read as a lift.
 */
export function createRodGestures(tuning: RodTuning = DEFAULT_TUNING) {
  const T = tuning;
  let backswingAt: number | null = null;
  let whipPeak = 0;
  let lastLift = -Infinity;
  const reset = () => {
    backswingAt = null;
    whipPeak = 0;
  };
  return {
    reset,
    push(sample: RodSample, want: 'cast' | 'lift'): RodEvent | null {
      // Positive `forward` swings the tip toward the water; negative lifts it.
      const forward = sample.pitchRate * T.pitchSign;
      if (want === 'lift') {
        reset();
        if (
          -forward >= T.liftDegPerSec &&
          sample.t - lastLift >= G.liftCooldownMs
        ) {
          lastLift = sample.t;
          return { kind: 'lift' };
        }
        return null;
      }
      if (-forward >= T.backswingDegPerSec) {
        backswingAt = sample.t;
        whipPeak = 0;
        return null;
      }
      if (backswingAt === null) return null;
      if (sample.t - backswingAt > G.swingWindowMs && whipPeak === 0) {
        reset();
        return null;
      }
      if (forward >= T.forwardDegPerSec) {
        whipPeak = Math.max(whipPeak, forward);
        return null;
      }
      if (whipPeak === 0) return null;
      // The whip ended: power scales from the threshold to full speed.
      const span = T.fullPowerDegPerSec - T.forwardDegPerSec;
      const share = Math.min(1, (whipPeak - T.forwardDegPerSec) / span);
      reset();
      return {
        kind: 'cast',
        power: Math.round(G.minPower + share * (100 - G.minPower)),
      };
    },
  };
}
