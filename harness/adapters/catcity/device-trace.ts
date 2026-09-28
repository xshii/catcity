import { FISHING } from '../../../src/content/fishing';
import {
  canPlay,
  motionActive,
  type FishingView,
} from '../../../src/view/fishing/view-state';
import { rateAxesFor, type RateAxes } from '../../../src/view/motion/calibrate';
import type { RodEvent, RodTuning } from '../../../src/view/motion/rod';

/** What the player was doing in the window: aiming a cast, striking a bite, calibrating. */
export type TraceWant = 'cast' | 'lift' | 'calibrate';
interface SensorReading {
  kind: 'motion' | 'orientation';
  /** Event time, ms. */
  t: number;
  a: number | null;
  b: number | null;
  g: number | null;
  angle: number;
  /** The rod tip was re-centred on this orientation reading. */
  rebase?: true;
  /** Just after a calibration: the rod lets this motion pass as part of it. */
  settle?: true;
  /** The game was not reading the rod then (city, a panel, paused, another phase). */
  off?: true;
}
/** A calibration inside the window switched the rod's tuning here. */
interface TuningChange {
  kind: 'tuning';
  t: number;
  tuning: RodTuning;
}
type Reading = SensorReading | TuningChange;
/** A window of a real device log, kept as a regression fixture (spec 015 step 3). */
export interface DeviceTrace {
  source: { session: string; from: number; to: number };
  device: Record<string, unknown> | null;
  want: TraceWant;
  /** The rod tuning in effect; null means the defaults. */
  tuning: RodTuning | null;
  /** How this browser orders `rotationRate`. */
  rateAxes: RateAxes;
  readings: Reading[];
  /** Why `expect` differs from what the device did, when that was a bug. */
  note?: string;
  /** What the game recognised then; edit it to what the player meant when that was a bug. */
  expect: { gestures: RodEvent[] } | { calibration: RodTuning | null };
}

type Entry = Record<string, unknown> & { kind: string; t: number };

/**
 * Cuts one window out of a device log (JSON lines of one page session). A cast window
 * starts at the latest rod re-centring before `from`, since the power is measured from it.
 */
export function extractDeviceTrace(
  log: string,
  span: { session: string; want: TraceWant; from: number; to: number },
): DeviceTrace {
  const entries = log
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Entry);
  const device = entries.find((entry) => entry.kind === 'device');
  let start = span.from;
  if (span.want === 'cast')
    start =
      lastOf(
        entries,
        (entry) => entry.kind === 'rebase' && entry.t <= span.from,
      )?.t ?? span.from;
  const inWindow = (entry: Entry) => entry.t >= start && entry.t <= span.to;
  let tuning: RodTuning | null = null;
  // Logs from before the game recorded it: only iOS browsers order the rates x, y, z.
  let rateAxes: RateAxes = rateAxesFor(
    String(device?.ua),
    typeof device?.touchPoints === 'number' ? device.touchPoints : 0,
  );
  for (const entry of entries) {
    if (entry.kind === 'tuning' && entry.rateAxes)
      rateAxes = entry.rateAxes as RateAxes;
    if (entry.t >= start) continue;
    if (entry.kind === 'tuning') tuning = pick(entry);
    const result = entry.result as { tuning: RodTuning } | null | undefined;
    if (entry.kind === 'calibration' && result) tuning = result.tuning;
  }
  // The fishing view state in force at a time, from the logged `view` entries.
  const views = entries.filter((entry) => entry.kind === 'view');
  const viewAt = (t: number) =>
    lastOf(views, (entry) => entry.t <= t) as unknown as
      FishingView | undefined;
  // The same gates as motion-fishing.ts: aiming reads the rod with motion on, the river
  // playable and no run; a bite window needs a run that is not paused.
  const reads = (t: number) => {
    const view = viewAt(t);
    if (!view || !motionActive(view) || !canPlay(view)) return false;
    return span.want === 'cast'
      ? view.runId === null
      : view.runId !== null && !view.paused;
  };
  const settling = (t: number) =>
    entries.some(
      (entry) =>
        entry.kind === 'calibration' &&
        t >= entry.t &&
        t < entry.t + FISHING.motion.gesture.calibration.settleMs,
    );
  const readings: Reading[] = [];
  for (const entry of entries.filter(inWindow)) {
    const calibrating = viewAt(entry.t)?.motion.calibrating ?? false;
    // While calibrating, rotation feeds the calibration, not the rod's gestures.
    if (entry.kind === 'motion' && calibrating && span.want !== 'calibrate')
      continue;
    if (entry.kind === 'rebase') {
      const last = lastOf(readings, (item) => item.kind === 'orientation');
      if (last?.t === entry.t) (last as SensorReading).rebase = true;
    }
    const result = entry.result as { tuning: RodTuning } | null | undefined;
    if (entry.kind === 'calibration' && result && span.want !== 'calibrate')
      readings.push({ kind: 'tuning', t: entry.t, tuning: result.tuning });
    if (entry.kind === 'motion' || entry.kind === 'orientation')
      readings.push({
        kind: entry.kind,
        t: entry.t,
        a: entry.a as number | null,
        b: entry.b as number | null,
        g: entry.g as number | null,
        angle: entry.angle as number,
        ...(entry.kind === 'motion' && settling(entry.t)
          ? { settle: true as const }
          : {}),
        ...(span.want !== 'calibrate' && !reads(entry.t)
          ? { off: true as const }
          : {}),
      });
  }
  const seen = entries.filter(inWindow);
  const calibration = lastOf(seen, (entry) => entry.kind === 'calibration');
  return {
    source: { session: span.session, from: start, to: span.to },
    device: device ? omit(device, ['kind', 't', 'received']) : null,
    want: span.want,
    tuning,
    rateAxes,
    readings,
    expect:
      span.want === 'calibrate'
        ? {
            calibration:
              (calibration?.result as { tuning: RodTuning } | null)?.tuning ??
              null,
          }
        : {
            gestures: seen
              .filter((entry) => entry.kind === 'gesture')
              .map((entry) => entry.gesture as RodEvent),
          },
  };
}

const lastOf = <T>(items: T[], test: (item: T) => boolean) =>
  [...items].reverse().find(test);
function pick(entry: Entry): RodTuning {
  return {
    axis: entry.axis as RodTuning['axis'],
    pitchSign: entry.pitchSign as RodTuning['pitchSign'],
    flickDegPerSec: entry.flickDegPerSec as number,
    liftDegPerSec: entry.liftDegPerSec as number,
  };
}
function omit(entry: Entry, keys: string[]) {
  return Object.fromEntries(
    Object.entries(entry).filter(([key]) => !keys.includes(key)),
  );
}
