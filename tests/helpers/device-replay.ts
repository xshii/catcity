import type { DeviceTrace } from '../../harness/adapters/catcity/device-trace';
import { calibrateSwing, screenRates } from '../../src/view/motion/calibrate';
import { OrientationTracker } from '../../src/view/motion/orientation';
import {
  createRodGestures,
  DEFAULT_TUNING,
  type RodEvent,
} from '../../src/view/motion/rod';
import { createRodTip } from '../../src/view/motion/tip';

const rates = (
  reading: DeviceTrace['readings'][number],
  axes: DeviceTrace['rateAxes'],
) =>
  screenRates(
    { alpha: reading.a, beta: reading.b, gamma: reading.g },
    reading.angle,
    axes,
  );

/**
 * Feeds a recorded window through the same pure pieces `motion-fishing.ts` wires to the
 * sensors, in the order the device delivered them, and says what the game recognises.
 */
export function replayDeviceTrace(trace: DeviceTrace): DeviceTrace['expect'] {
  const motion = trace.readings.filter(
    (reading) =>
      reading.kind === 'motion' &&
      typeof reading.b === 'number' &&
      Number.isFinite(reading.b),
  );
  if (trace.want === 'calibrate')
    return {
      calibration:
        calibrateSwing(
          motion.map((reading) => ({
            t: reading.t,
            ...rates(reading, trace.rateAxes),
          })),
        )?.tuning ?? null,
    };
  const tuning = trace.tuning ?? DEFAULT_TUNING;
  const tracker = new OrientationTracker();
  const tip = createRodTip();
  const gestures = createRodGestures(tuning);
  let power = 50;
  const recognised: RodEvent[] = [];
  for (const reading of trace.readings) {
    if (reading.kind === 'orientation') {
      const tilt = tracker.sample(reading.b, reading.g, reading.angle);
      if (!tilt) continue;
      if (reading.rebase) tip.calibrate(tilt);
      // Aiming sets the power until the cast; a bite window leaves it alone.
      if (trace.want === 'cast') power = tip.power(tilt);
      continue;
    }
    if (!motion.includes(reading)) continue;
    if (reading.settle) {
      gestures.settle();
      continue;
    }
    const event = gestures.push(
      {
        t: reading.t,
        pitchRate: rates(reading, trace.rateAxes)[tuning.axis],
        power,
      },
      trace.want,
    );
    if (!event) continue;
    recognised.push(event);
    // A cast starts a run: from then on the rod waits for a bite, not a cast.
    if (event.kind === 'cast') break;
  }
  return { gestures: recognised };
}
