import type { DeviceTrace } from '../../harness/adapters/catcity/device-trace';
import { calibrateSwing, screenRates } from '../../src/view/motion/calibrate';
import { OrientationTracker } from '../../src/view/motion/orientation';
import {
  createRodGestures,
  DEFAULT_TUNING,
  type RodEvent,
} from '../../src/view/motion/rod';
import { createRodTip } from '../../src/view/motion/tip';

type Reading = DeviceTrace['readings'][number];
type Sensor = Exclude<Reading, { kind: 'tuning' }>;

const rates = (reading: Sensor, axes: DeviceTrace['rateAxes']) =>
  screenRates(
    { alpha: reading.a, beta: reading.b, gamma: reading.g },
    reading.angle,
    axes,
  );
const hasRate = (reading: Reading): reading is Sensor =>
  reading.kind === 'motion' &&
  typeof reading.b === 'number' &&
  Number.isFinite(reading.b);

/**
 * Feeds a recorded window through the same pure pieces `motion-fishing.ts` wires to the
 * sensors, in the order the device delivered them, with the same gates (a reading the
 * game was not reading resets the rod) and tuning switches, and says what it recognises.
 */
export function replayDeviceTrace(trace: DeviceTrace): DeviceTrace['expect'] {
  if (trace.want === 'calibrate')
    return {
      calibration:
        calibrateSwing(
          trace.readings.filter(hasRate).map((reading) => ({
            t: reading.t,
            ...rates(reading, trace.rateAxes),
          })),
        )?.tuning ?? null,
    };
  let tuning = trace.tuning ?? DEFAULT_TUNING;
  const tracker = new OrientationTracker();
  const tip = createRodTip();
  let gestures = createRodGestures(tuning);
  let power = 50;
  const recognised: RodEvent[] = [];
  for (const reading of trace.readings) {
    if (reading.kind === 'tuning') {
      tuning = reading.tuning;
      gestures = createRodGestures(tuning);
      continue;
    }
    if (reading.kind === 'orientation') {
      const tilt = tracker.sample(reading.b, reading.g, reading.angle);
      if (!tilt) continue;
      if (reading.rebase) tip.calibrate(tilt);
      // Only aiming sets the power, and only while the game reads the rod.
      if (trace.want === 'cast' && !reading.off) power = tip.power(tilt);
      continue;
    }
    if (!hasRate(reading)) continue;
    if (reading.settle) {
      gestures.settle();
      continue;
    }
    if (reading.off) {
      gestures.reset();
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
