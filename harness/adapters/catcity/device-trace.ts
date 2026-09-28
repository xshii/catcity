import { FISHING } from '../../../src/content/fishing';
import { rateAxesFor, type RateAxes } from '../../../src/view/motion/calibrate';
import type { RodEvent, RodTuning } from '../../../src/view/motion/rod';

/** What the player was doing in the window: aiming a cast, striking a bite, calibrating. */
export type TraceWant = 'cast' | 'lift' | 'calibrate';
interface Reading {
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
}
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
  let rateAxes: RateAxes = rateAxesFor(String(device?.ua), 0);
  for (const entry of entries) {
    if (entry.kind === 'tuning' && entry.rateAxes)
      rateAxes = entry.rateAxes as RateAxes;
    if (entry.t >= start) continue;
    if (entry.kind === 'tuning') tuning = pick(entry);
    const result = entry.result as { tuning: RodTuning } | null | undefined;
    if (entry.kind === 'calibration' && result) tuning = result.tuning;
  }
  // While calibrating, rotation feeds the calibration, not the rod's gestures.
  const calibrating: [number, number][] = [];
  for (const entry of entries)
    if (entry.kind === 'view') {
      const on = (entry.motion as { calibrating: boolean }).calibrating;
      const open = calibrating.at(-1);
      if (on && (!open || open[1] !== Infinity))
        calibrating.push([entry.t, Infinity]);
      if (!on && open?.[1] === Infinity) open[1] = entry.t;
    }
  const feedsGestures = (t: number) =>
    span.want === 'calibrate' ||
    !calibrating.some(([from, to]) => t >= from && t <= to);
  const settling = (t: number) =>
    entries.some(
      (entry) =>
        entry.kind === 'calibration' &&
        t >= entry.t &&
        t < entry.t + FISHING.motion.gesture.calibration.settleMs,
    );
  const readings: Reading[] = [];
  for (const entry of entries.filter(inWindow)) {
    if (entry.kind === 'motion' && !feedsGestures(entry.t)) continue;
    if (entry.kind === 'rebase') {
      const last = lastOf(readings, (item) => item.kind === 'orientation');
      if (last?.t === entry.t) last.rebase = true;
    }
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
