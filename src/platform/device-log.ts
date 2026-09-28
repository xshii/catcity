/** Records one debug entry; `t` defaults to page time in ms. */
export type Trace = (kind: string, data?: Record<string, unknown>) => void;

/** Per-device opt-in, set by opening the page with `?debug=1` and cleared by `?debug=0`. */
const FLAG_KEY = 'cat-city.debug-log';
/** Served by the phone try-out preview only (harness/runner/device-log.ts). */
const ENDPOINT = './__device-log';
const FLUSH_MS = 2000;
/** About a minute of sensor readings; older unsent entries are dropped and counted. */
const MAX_PENDING = 8000;
/** Browsers refuse larger keepalive requests. */
const KEEPALIVE_BYTES = 60_000;

type Entry = Record<string, unknown> & { kind: string };

/** Whether this device logs: the URL flag decides and is remembered, else the stored choice. */
export function debugLogWanted(search: string, stored: string | null) {
  const flag = new URLSearchParams(search).get('debug');
  return flag === '1' ? true : flag === '0' ? false : stored === '1';
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
    take() {
      const batch = { entries, dropped };
      entries = [];
      dropped = 0;
      return batch;
    },
  };
}

const round = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : null;

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
  if (!debugLogWanted(location.search, stored)) return null;

  const session = crypto.randomUUID();
  const batch = createLogBatch(MAX_PENDING);
  const trace: Trace = (kind, data = {}) =>
    batch.push({ t: round(performance.now()), kind, ...data });
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
      keepalive: next.json.length < KEEPALIVE_BYTES,
    })
      .then((response) => {
        if (response.ok) sent += next.count;
        else failed++;
      })
      .catch(() => failed++)
      .finally(show);
  };
  window.setInterval(flush, FLUSH_MS);
  // A page being left may never run its timers again.
  window.addEventListener('pagehide', () => {
    const next = body();
    if (next) navigator.sendBeacon(ENDPOINT, next.json);
  });

  const angle = () => screen.orientation?.angle ?? 0;
  window.addEventListener('devicemotion', (event) => {
    const rate = event.rotationRate;
    trace('motion', {
      t: round(event.timeStamp),
      a: round(rate?.alpha),
      b: round(rate?.beta),
      g: round(rate?.gamma),
      angle: angle(),
    });
  });
  window.addEventListener('deviceorientation', (event) => {
    trace('orientation', {
      t: round(event.timeStamp),
      a: round(event.alpha),
      b: round(event.beta),
      g: round(event.gamma),
      angle: angle(),
    });
  });
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
    angle: angle(),
    secure: window.isSecureContext,
  });
  return trace;
}
