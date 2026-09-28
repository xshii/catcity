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
}
/** A window of a real device log, kept as a regression fixture (spec 015 step 3). */
export interface DeviceTrace {
  source: { session: string; from: number; to: number };
  device: Record<string, unknown> | null;
  want: TraceWant;
  /** The rod tuning in effect; null means the defaults. */
  tuning: RodTuning | null;
  readings: Reading[];
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
  for (const entry of entries) {
    if (entry.t >= start) break;
    if (entry.kind === 'tuning') tuning = pick(entry);
    const result = entry.result as { tuning: RodTuning } | null | undefined;
    if (entry.kind === 'calibration' && result) tuning = result.tuning;
  }
  const readings: Reading[] = [];
  for (const entry of entries.filter(inWindow)) {
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
      });
  }
  const seen = entries.filter(inWindow);
  const calibration = lastOf(seen, (entry) => entry.kind === 'calibration');
  return {
    source: { session: span.session, from: start, to: span.to },
    device: device ? omit(device, ['kind', 't', 'received']) : null,
    want: span.want,
    tuning,
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
