import { FISHING } from '../../content/fishing';

const G = FISHING.motion.gesture;

export interface RodSample {
  /** Milliseconds, monotonic (event timestamps). */
  t: number;
  /** Gyroscope rate about the tuned axis, °/s, as reported by the device. */
  pitchRate: number;
  /** The power the slow pitch currently sets (0–100). */
  power: number;
}
export type RodEvent = { kind: 'cast'; power: number } | { kind: 'lift' };

/** Which rate axis is the rod's pitch, its sign, and the speeds that count (°/s). */
export interface RodTuning {
  axis: 'pitch' | 'roll' | 'yaw';
  pitchSign: 1 | -1;
  flickDegPerSec: number;
  liftDegPerSec: number;
}
export const DEFAULT_TUNING: RodTuning = {
  axis: G.axis,
  pitchSign: G.pitchSign,
  flickDegPerSec: G.flickDegPerSec,
  liftDegPerSec: G.liftDegPerSec,
};

/**
 * Phone-as-rod gestures (spec 030). Pure: fed samples and timestamps, it reports a cast
 * when the tip flicks down fast (with the power set just before the flick began) or a
 * lift when it flicks up fast. Slow pitching only sets the power. `want` scopes
 * recognition to the phase; the rebound of a cast is never read as a lift.
 */
export function createRodGestures(tuning: RodTuning = DEFAULT_TUNING) {
  let history: { t: number; power: number }[] = [];
  let onsetPower: number | null = null;
  let flicking = false;
  let lastLift = -Infinity;
  // The first reading inside the lead window: after a gap in the stream, older
  // readings are stale.
  const powerFrom = (t: number) =>
    (history.find((entry) => entry.t >= t) ?? history.at(-1)!).power;
  const reset = () => {
    history = [];
    onsetPower = null;
    flicking = false;
  };
  return {
    reset,
    /** Treats the rod as mid-flick: nothing counts until it slows below the onset. */
    settle() {
      reset();
      flicking = true;
    },
    push(sample: RodSample, want: 'cast' | 'lift'): RodEvent | null {
      // Positive `down` flicks the tip toward the water; negative lifts it.
      const down = sample.pitchRate * tuning.pitchSign;
      if (want === 'lift') {
        history = [];
        onsetPower = null;
        if (
          !flicking &&
          -down >= tuning.liftDegPerSec &&
          sample.t - lastLift >= G.liftCooldownMs
        ) {
          lastLift = sample.t;
          return { kind: 'lift' };
        }
        if (Math.abs(down) < G.onsetDegPerSec) flicking = false;
        return null;
      }
      history.push({ t: sample.t, power: sample.power });
      history = history.filter(
        (entry) => entry.t >= sample.t - 2 * G.powerLeadMs - 100,
      );
      if (flicking) {
        if (Math.abs(down) < G.onsetDegPerSec) flicking = false;
        return null;
      }
      if (down < G.onsetDegPerSec) {
        onsetPower = null;
        return null;
      }
      // Read the power as the push starts; it may sag while the push speeds up.
      onsetPower ??= powerFrom(sample.t - G.powerLeadMs);
      if (down < tuning.flickDegPerSec) return null;
      const power = onsetPower;
      onsetPower = null;
      flicking = true;
      // The rebound of this flick must not strike the new run.
      lastLift = sample.t;
      return { kind: 'cast', power };
    },
  };
}
