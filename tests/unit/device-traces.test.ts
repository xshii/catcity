import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEVICE_FIXTURES,
  extractDeviceTrace,
  type DeviceTrace,
} from '../../harness/adapters/catcity/device-trace';
import { FISHING } from '../../src/content/fishing';
import {
  initialFishingView,
  type FishingView,
} from '../../src/view/fishing/view-state';
import { DEFAULT_TUNING } from '../../src/view/motion/rod';
import { replayDeviceTrace } from '../helpers/device-replay';

const G = FISHING.motion.gesture;
/** A pitch rate the default tuning reads as the tip going down this fast (°/s). */
const down = (speed: number) => speed * G.pitchSign;

/** A synthetic device log in the receiver's format: one JSON line per entry, 60 Hz. */
function syntheticLog(
  place: 'river' | 'city',
  build: (log: {
    entry: (kind: string, data: Record<string, unknown>) => void;
    hold: (ms: number, beta: number, rate?: number) => void;
    now: () => number;
  }) => void,
) {
  const lines: string[] = [];
  let t = 1000;
  const entry = (kind: string, data: Record<string, unknown>) =>
    lines.push(
      JSON.stringify({ received: '2026-09-29T00:00:00Z', t, kind, ...data }),
    );
  entry('device', { build: 'test', ua: 'synthetic' });
  entry('tuning', { ...DEFAULT_TUNING });
  // The fishing view as logged: motion on and nothing cast yet.
  const view = initialFishingView({
    preference: 'motion',
    needsPermission: true,
    coarsePointer: true,
    guide: null,
    autoCalibrate: false,
    aimHintSeen: false,
  });
  entry('view', {
    ...view,
    place,
    motion: { ...view.motion, capability: 'ready' },
  } satisfies FishingView);
  build({
    entry,
    now: () => t,
    // Orientation and motion readings, as a phone delivers them.
    hold(ms, beta, rate = 0) {
      for (const end = t + ms; t < end; t += 16) {
        entry('orientation', { a: 0, b: beta, g: 0, angle: 0 });
        entry('motion', { a: 0, b: rate, g: 0, angle: 0 });
      }
    },
  });
  return lines.join('\n') + '\n';
}

describe('device traces', () => {
  /** A flick down after the rod re-centred and slow pitching set power 70. */
  const flickLog = (place: 'river' | 'city') => {
    let from = 0;
    const log = syntheticLog(place, ({ entry, hold, now }) => {
      hold(200, 10);
      // The rod re-centres on a pose, then pitching back 40% of the range sets power 70.
      entry('orientation', { a: 0, b: 40, g: 0, angle: 0 });
      entry('rebase', {});
      hold(1000, 40 + G.powerRangeDeg * 0.4);
      from = now();
      for (const speed of [120, 320, 500, 200, 0])
        hold(16, 40 + G.powerRangeDeg * 0.4, down(speed));
      entry('gesture', { gesture: { kind: 'cast', power: 70 } });
      hold(200, 40 + G.powerRangeDeg * 0.4);
    });
    return extractDeviceTrace(log, {
      session: 's',
      want: 'cast',
      from,
      to: from + 400,
    });
  };

  it('cuts a cast window from its re-centring and replays the power set by the pitch', () => {
    const trace = flickLog('river');
    expect(trace.source.from).toBeLessThan(trace.readings.at(-1)!.t);
    expect(
      trace.readings.filter((reading) => 'rebase' in reading && reading.rebase),
    ).toHaveLength(1);
    expect(trace.tuning).toEqual(DEFAULT_TUNING);
    expect(trace.device).toEqual({ build: 'test', ua: 'synthetic' });
    expect(trace.expect).toEqual({
      gestures: [{ kind: 'cast', power: 70 }],
    });
    expect(replayDeviceTrace(trace)).toEqual(trace.expect);
  });

  it('replays nothing the game was not reading: the same flick in the city casts nothing', () => {
    const trace = flickLog('city');
    expect(trace.readings.some((reading) => 'off' in reading)).toBe(true);
    expect(replayDeviceTrace(trace)).toEqual({ gestures: [] });
  });

  it('replays a calibration window with the tuning it produced', () => {
    let from = 0;
    const log = syntheticLog('river', ({ entry, hold, now }) => {
      from = now();
      for (let flick = 0; flick < 2; flick++) {
        hold(300, 0);
        // Both flicks peak at 420°/s; the thresholds are shares of that.
        for (const speed of [200, 420, 380, 150]) hold(16, 0, down(speed));
      }
      hold(400, 0);
      entry('calibration', {
        samples: 0,
        result: {
          peak: 420,
          tuning: {
            axis: 'pitch',
            pitchSign: G.pitchSign,
            flickDegPerSec: 210,
            liftDegPerSec: 252,
          },
        },
      });
    });
    const trace = extractDeviceTrace(log, {
      session: 's',
      want: 'calibrate',
      from,
      to: from + 2000,
    });
    expect(trace.expect).toEqual({
      calibration: {
        axis: 'pitch',
        pitchSign: G.pitchSign,
        flickDegPerSec: 210,
        liftDegPerSec: 252,
      },
    });
    expect(replayDeviceTrace(trace)).toEqual(trace.expect);
  });

  it('replays every recorded device window to what the player meant', () => {
    const directory = join(import.meta.dirname, '../..', DEVICE_FIXTURES);
    let files: string[] = [];
    try {
      files = readdirSync(directory).filter((file) => file.endsWith('.json'));
    } catch {
      // No real-device window has been recorded yet.
    }
    for (const file of files) {
      const trace = JSON.parse(
        readFileSync(join(directory, file), 'utf8'),
      ) as DeviceTrace;
      expect(replayDeviceTrace(trace), file).toEqual(trace.expect);
    }
  });
});
