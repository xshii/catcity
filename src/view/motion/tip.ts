import { FISHING } from '../../content/fishing';

const G = FISHING.motion.gesture;
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
  let smoothed: Tilt = { x: 50, y: 50 };
  let power = 50;
  return {
    calibrate(pose: Tilt) {
      zero = { ...pose };
      smoothed = { x: 50, y: 50 };
      power = 50;
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
