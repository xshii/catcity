import { FISHING } from '../../content/fishing';
import type { AnglingRun } from '../../minigames/angling';

const G = FISHING.motion.gesture;
const CENTRE = FISHING.motion.planeCentre;
const REST_POWER = FISHING.input.maxPower / 2;
type Tilt = { x: number; y: number };
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Maps continuous tilt (degrees, from OrientationTracker) to the rod tip on the 100×100
 * water plane, to the aim direction and to the cast power, relative to a calibrated
 * resting pose.
 */
export function createRodTip() {
  let zero: Tilt = { x: 0, y: 0 };
  // The calibrated pose is the centre, so the first reading eases in from there.
  let smoothed: Tilt = { ...CENTRE };
  let power = REST_POWER;
  return {
    calibrate(pose: Tilt) {
      zero = { ...pose };
      smoothed = { ...CENTRE };
      power = REST_POWER;
    },
    point(tilt: Tilt): { x: number; y: number } {
      const target = {
        x: clamp(50 + ((tilt.x - zero.x) / G.tiltRangeDeg) * 50, 0, 100),
        y: clamp(50 + ((tilt.y - zero.y) / G.tiltRangeDeg) * 50, 0, 100),
      };
      smoothed = {
        x: smoothed.x + (target.x - smoothed.x) * G.smoothing,
        y: smoothed.y + (target.y - smoothed.y) * G.smoothing,
      };
      return { x: Math.round(smoothed.x), y: Math.round(smoothed.y) };
    },
    /** Pitch back raises the power and forward lowers it; the resting pose is half. */
    power(tilt: Tilt): number {
      const target = clamp(
        50 + ((tilt.y - zero.y) / G.powerRangeDeg) * 50,
        0,
        100,
      );
      power += (target - power) * G.smoothing;
      return Math.round(power);
    },
    aim(tilt: Tilt): number {
      const max = FISHING.input.maxDirection;
      return Math.round(
        clamp(((tilt.x - zero.x) / G.aimRangeDeg) * max, -max, max),
      );
    },
  };
}

/**
 * Where the rod tip is centred when a run's phase changes. Aiming (no run) centres on
 * the current pose. The fight centres on the pose held at the bite: the current one is
 * mid-lift (recorded on an iPhone: 25° and rising to 58°, back to the 15° held before),
 * which would skew the whole fight. A fight restored without a bite pose uses the current.
 */
export function centreOnPhase(
  phase: AnglingRun['phase'] | null,
  held: Tilt | null,
  pose: Tilt | null,
): { held: Tilt | null; centre: 'current' | Tilt | null } {
  if (phase === null) return { held: null, centre: 'current' };
  if (phase === 'hook') return { held: pose, centre: null };
  if (phase === 'fight') return { held: null, centre: held ?? 'current' };
  return { held: null, centre: null };
}
