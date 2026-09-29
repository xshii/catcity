import type { TraceEntry } from '../application';
import type { WorldState } from '../core';

/** Records one debug entry; `t` defaults to page time in ms. */
export type Trace = (kind: string, data?: Record<string, unknown>) => void;

/** Per-device opt-in, set by opening the page with `?debug=1` and cleared by `?debug=0`. */
const FLAG_KEY = 'cat-city.debug-log';
/** Served by the phone try-out preview only (harness/runner/device-log.ts). */
const ENDPOINT = './__device-log';
const FLUSH_MS = 2000;
/**
 * About 45 s of sensor readings, and under the receiver's request limit when full; older
 * unsent entries are dropped and counted.
 */
const MAX_PENDING = 6000;
/** Browsers refuse larger keepalive requests. */
const KEEPALIVE_BYTES = 60_000;

type Entry = Record<string, unknown> & { kind: string };

/** Whether this device logs: the `?debug` flag decides and is remembered, else the stored choice. */
export function debugLogWanted(flag: string | null, stored: string | null) {
  return flag === '1' ? true : flag === '0' ? false : stored === '1';
}

/**
 * What the log keeps of a command, or null to skip it: a per-tick fishing control is
 * kept only when it changed play, since every tick reports a 'control' change. Chat text
 * stays on the device; the log keeps only who was talked to.
 */
export function commandLogEntry(
  { command, result }: TraceEntry,
  run: WorldState['fishing']['active'],
) {
  const tick =
    command.type === 'FISH_CONTROL' || command.type === 'FISH_MOTION_CONTROL';
  if (
    tick &&
    result.ok &&
    result.events.every(
      (event) => event.type === 'FishingChanged' && event.action === 'control',
    )
  )
    return null;
  return {
    command: tick
      ? command.type
      : command.type === 'INTERACT'
        ? { type: command.type, catId: command.catId }
        : command,
    ...(result.ok
      ? { ok: true, events: result.events }
      : { ok: false, error: result.error }),
    run,
  };
}

/** Unsent entries, bounded: when full the oldest go, and the count of them is sent. */
export function createLogBatch(limit: number) {
  let entries: Entry[] = [];
  let dropped = 0;
  return {
    push(entry: Entry) {
      if (entries.length >= limit) {
        entries.shift();
        dropped++;
      }
      entries.push(entry);
    },
    /** Entries that were taken but never arrived (a failed send). */
    lost(count: number) {
      dropped += count;
    },
    take() {
      const batch = { entries, dropped };
      entries = [];
      dropped = 0;
      return batch;
    },
  };
}

/** Times in the log, to 0.01 ms, rounded alike so entries of one event match exactly. */
export const logTime = (ms: number): number => Math.round(ms * 100) / 100;

const screenAngle = () => screen.orientation?.angle ?? 0;
/** A raw sensor reading: its time, the three values as precise as times, the screen angle. */
function sensorEntry(
  timeStamp: number,
  values: Pick<DeviceOrientationEvent, 'alpha' | 'beta' | 'gamma'> | null,
) {
  const value = (reading: number | null | undefined) =>
    typeof reading === 'number' && Number.isFinite(reading)
      ? logTime(reading)
      : null;
  return {
    t: logTime(timeStamp),
    a: value(values?.alpha),
    b: value(values?.beta),
    g: value(values?.gamma),
    angle: screenAngle(),
  };
}

/** A page-session id; `crypto.randomUUID` needs a secure context, this does not. */
export function sessionId(random: (bytes: Uint8Array) => Uint8Array) {
  const hex = Array.from(random(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Device debug log (spec 015 step 3). Off unless this device opted in; then it records
 * raw sensor readings, errors and what the game traces, and posts them in batches to the
 * preview that served the page. A badge says it is on. Returns null when off.
 */
export function startDeviceLog(build: string): Trace | null {
  let stored: string | null = null;
  const flag = new URLSearchParams(location.search).get('debug');
  try {
    if (flag === '1') localStorage.setItem(FLAG_KEY, '1');
    if (flag === '0') localStorage.removeItem(FLAG_KEY);
    stored = localStorage.getItem(FLAG_KEY);
  } catch {
    // Blocked storage: only the URL flag of this page counts.
  }
  if (!debugLogWanted(flag, stored)) return null;

  const session = sessionId((bytes) => crypto.getRandomValues(bytes));
  const batch = createLogBatch(MAX_PENDING);
  const trace: Trace = (kind, data = {}) =>
    batch.push({ t: logTime(performance.now()), kind, ...data });
  let sent = 0;
  let failed = 0;
  const badge = document.createElement('div');
  badge.id = 'debug-log-badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.style.cssText =
    'position:fixed;left:4px;bottom:4px;z-index:9999;pointer-events:none;' +
    'font:11px/1.4 system-ui;padding:1px 6px;border-radius:8px;' +
    'background:rgba(0,0,0,.6);color:#fff';
  const show = () => {
    badge.textContent = `调试日志 · 已发 ${sent}${failed ? ` · 失败 ${failed}` : ''}`;
  };
  show();
  document.body.append(badge);

  const body = () => {
    const { entries, dropped } = batch.take();
    return entries.length || dropped
      ? {
          count: entries.length,
          json: JSON.stringify({ session, dropped, entries }),
        }
      : null;
  };
  const flush = () => {
    const next = body();
    if (!next) return;
    fetch(ENDPOINT, {
      method: 'POST',
      body: next.json,
      // The limit counts UTF-8 bytes, not string length.
      keepalive: new Blob([next.json]).size < KEEPALIVE_BYTES,
    })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        sent += next.count;
      })
      .catch(() => {
        // The next batch says how much never arrived, so gaps are not read as calm.
        failed++;
        batch.lost(next.count);
      })
      .finally(show);
  };
  window.setInterval(flush, FLUSH_MS);
  // A page being left may never run its timers again.
  window.addEventListener('pagehide', () => {
    const next = body();
    if (next) navigator.sendBeacon(ENDPOINT, next.json);
  });

  window.addEventListener('devicemotion', (event) =>
    trace('motion', sensorEntry(event.timeStamp, event.rotationRate)),
  );
  window.addEventListener('deviceorientation', (event) =>
    trace('orientation', sensorEntry(event.timeStamp, event)),
  );
  window.addEventListener('error', (event) =>
    trace('error', {
      message: event.message,
      source: `${event.filename}:${event.lineno}:${event.colno}`,
      stack: (event.error as Error | undefined)?.stack ?? null,
    }),
  );
  window.addEventListener('unhandledrejection', (event) =>
    trace('error', { message: String(event.reason) }),
  );
  document.addEventListener('visibilitychange', () =>
    trace('page', { hidden: document.hidden }),
  );
  trace('device', {
    build,
    time: new Date().toISOString(),
    ua: navigator.userAgent,
    screen: `${screen.width}x${screen.height}`,
    dpr: window.devicePixelRatio,
    angle: screenAngle(),
    touchPoints: navigator.maxTouchPoints,
    secure: window.isSecureContext,
  });
  return trace;
}
