import { onTestFinished, vi } from 'vitest';
import { GameSession } from '../../src/application';
import { STARTER_CAT_ID } from '../../src/content/cats';
import { FISHING } from '../../src/content/fishing';
import { BrowserSaveRepository } from '../../src/platform/storage';
import { RuleBasedDialogueProvider } from '../../src/providers/rule-dialogue';
import { mountGameView } from '../../src/view';

// Phaser draws the map and the river on a canvas; the rig checks the page around it.
vi.mock('phaser', () => ({
  default: {
    AUTO: 0,
    Scale: { FIT: 0, CENTER_BOTH: 0 },
    Game: class {},
    Scene: class {},
    // Classes the art extends when its module loads (cat art is a Container).
    GameObjects: { Container: class {} },
  },
}));

/** The browser the page loads in; by default a desktop Chromium, like the E2E suite's. */
export interface Device {
  /** A phone: its pointer is coarse (touch). */
  phone?: boolean;
  /** Sensors ask for permission first (iOS Safari), and the player answers this. */
  permission?: 'granted' | 'denied';
  /** `navigator.userActivation` exists (Safari 16.4+, Chromium); default true. */
  userActivation?: boolean;
  /** Served over HTTPS (or localhost); default true. Motion needs it. */
  secure?: boolean;
  /** `navigator.vibrate` exists, as in Chromium; default true. */
  vibration?: boolean;
  /** A stand-in Web Audio that counts contexts and started sounds (Node has none). */
  audio?: boolean;
  /** localStorage before the first load: a save or per-device choices. */
  storage?: Record<string, string>;
}
type Vibration = number | number[];
const TICK_MS = 1000 / FISHING.ticksPerSecond;
/**
 * The browser's transient user activation (`navigator.userActivation.isActive`): on only
 * while a player's tap is being dispatched, as in a browser for code run inside it.
 */
let activation = false;
/** Sensor permission requests: which sensor, and whether it came inside a tap. */
type SensorAsk = { sensor: 'motion' | 'orientation'; inTap: boolean };

/**
 * The real page (markup, session, panels and wiring) in happy-dom, with fake timers:
 * time passes only through `wait` and fishing ticks only through `tick`.
 */
export function openGame(device: Device = {}) {
  vi.useFakeTimers();
  localStorage.clear();
  for (const [key, value] of Object.entries(device.storage ?? {}))
    localStorage.setItem(key, value);
  // localhost is a secure context in browsers; motion needs one.
  vi.stubGlobal('isSecureContext', device.secure ?? true);
  vi.stubGlobal('Option', option);
  if (device.userActivation !== false)
    Object.defineProperty(navigator, 'userActivation', {
      configurable: true,
      get: () => ({ isActive: activation }),
    });
  if (device.phone) coarsePointer();
  const sensorAsks: SensorAsk[] = [];
  if (device.permission) askForSensors(device.permission, sensorAsks);
  let page = load(device);
  onTestFinished(() => {
    page.unload();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'vibrate');
    Reflect.deleteProperty(navigator, 'userActivation');
    localStorage.clear();
  });
  return {
    get session() {
      return page.session;
    },
    world: () => page.session.getSnapshot(),
    /** `navigator.vibrate` calls since the page loaded. */
    get vibrations() {
      return page.vibrations;
    },
    get audio() {
      return page.audio;
    },
    /** Sensor permission requests since the game opened, across reloads. */
    sensorAsks,
    /** Let the page hear pending answers (a permission prompt's), without time passing. */
    async answer() {
      for (let hop = 0; hop < 10; hop++) await Promise.resolve();
    },
    /** A new page on the same storage and device, like a browser reload. */
    reload() {
      page.unload();
      page = load(device);
    },
    /** Let real time pass: timers and intervals due by then run. */
    wait: (ms: number) => vi.advanceTimersByTime(ms),
    /**
     * Fishing ticks through the view's own clock, each after its 50 ms of real time;
     * returns how many applied (none while paused).
     */
    tick(ticks = 1) {
      let applied = 0;
      for (let i = 0; i < ticks; i++) {
        vi.advanceTimersByTime(TICK_MS);
        applied += page.clock.step(1);
      }
      return applied;
    },
    /** The 20 Hz real-time fishing loop instead of `tick`. */
    realFishingClock: () => page.clock.setManual(false),
    /** Tick until `done`, failing after `maxTicks`, like the adapter's manual clock. */
    until(done: () => boolean, maxTicks: number) {
      for (let tick = 0; tick <= maxTicks; tick++) {
        if (done()) return;
        this.tick();
      }
      throw new Error(`Fishing condition not met within ${maxTicks} ticks`);
    },
  };
}
export type Game = ReturnType<typeof openGame>;

function load(device: Device) {
  const removeListeners = trackWindowListeners();
  const vibrations: Vibration[] = [];
  if (device.vibration !== false)
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (pattern: Vibration) => vibrations.push(pattern) > 0,
    });
  const audio = { contexts: 0, starts: 0 };
  if (device.audio) vi.stubGlobal('AudioContext', audioContext(audio));
  document.body.innerHTML = '<div id="app"></div>';
  // Composed as src/main.ts composes the test build.
  const dialogue = new RuleBasedDialogueProvider();
  const session = new GameSession({
    repository: new BrowserSaveRepository(),
    dialogue,
    fallbackDialogue: dialogue,
    seed: 42,
  });
  session.select(STARTER_CAT_ID);
  const view = mountGameView(session, () => {});
  // Like the bridge's manual clock: fishing ticks only when a test steps it.
  view.fishingClock.setManual(true);
  return {
    session,
    clock: view.fishingClock,
    vibrations,
    audio,
    unload() {
      removeListeners();
      vi.clearAllTimers();
    },
  };
}

/** The page's window and document listeners, removed when it unloads. */
function trackWindowListeners() {
  const added: (() => void)[] = [];
  const spies = ([window, document] as EventTarget[]).map((target) => {
    const add = target.addEventListener.bind(target);
    return vi
      .spyOn(target, 'addEventListener')
      .mockImplementation((type, listener, options) => {
        add(type, listener, options);
        added.push(() => target.removeEventListener(type, listener, options));
      });
  });
  return () => {
    for (const spy of spies) spy.mockRestore();
    for (const remove of added.splice(0)) remove();
  };
}

/** happy-dom lacks the `Option` constructor the panels use. */
function option(text?: string, value?: string) {
  const element = document.createElement('option');
  if (text !== undefined) element.text = text;
  if (value !== undefined) element.value = value;
  return element;
}

function coarsePointer() {
  const media = window.matchMedia.bind(window);
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const list = media(query);
    if (query === '(pointer: coarse)')
      Object.defineProperty(list, 'matches', { value: true });
    return list;
  });
}

/** iOS Safari's sensor events, which ask for permission; happy-dom aliases both to `Event`. */
function askForSensors(answer: 'granted' | 'denied', asks: SensorAsk[]) {
  for (const [sensor, name] of [
    ['motion', 'DeviceMotionEvent'],
    ['orientation', 'DeviceOrientationEvent'],
  ] as const)
    vi.stubGlobal(
      name,
      class extends Event {
        static requestPermission() {
          asks.push({ sensor, inTap: activation });
          return Promise.resolve(answer);
        }
      },
    );
}

/** A Web Audio stand-in that counts contexts and started sounds. */
function audioContext(stats: { contexts: number; starts: number }) {
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
  });
  const node = () => ({
    gain: param(),
    frequency: param(),
    type: '',
    buffer: null,
    connect: (next: unknown) => next,
    start: () => stats.starts++,
    stop() {},
  });
  return class {
    currentTime = 0;
    sampleRate = 8000;
    state = 'running';
    destination = node();
    constructor() {
      stats.contexts++;
    }
    createGain = node;
    createOscillator = node;
    createBiquadFilter = node;
    createBufferSource = node;
    createBuffer = (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    });
    resume = () => Promise.resolve();
    suspend = () => Promise.resolve();
  };
}

/** The element; a missing one is a test error, as a Playwright action would time out. */
export function $<T extends HTMLElement = HTMLElement>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Nothing matches ${selector}`);
  return element;
}

/** On screen as a player sees it: attached, and nothing hides it or styles it away. */
export function visible(target: string | Element) {
  const element =
    typeof target === 'string' ? document.querySelector(target) : target;
  if (!element?.isConnected || element.closest('[hidden]')) return false;
  if (getComputedStyle(element).visibility === 'hidden') return false;
  for (let node: Element | null = element; node; node = node.parentElement)
    if (getComputedStyle(node).display === 'none') return false;
  return true;
}

export const text = (selector: string) => $(selector).textContent ?? '';

/** A mouse click: pointer down (focus) and up, then the click; only on what a player can click. */
export function click(selector: string) {
  const element = $(selector);
  if (!visible(selector)) throw new Error(`${selector} is not visible`);
  if ((element as HTMLButtonElement).disabled)
    throw new Error(`${selector} is disabled`);
  const pointer = { bubbles: true, cancelable: true, pointerId: 1 };
  activation = true;
  try {
    element.dispatchEvent(new PointerEvent('pointerdown', pointer));
    element.focus();
    element.dispatchEvent(new PointerEvent('pointerup', pointer));
    element.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }),
    );
  } finally {
    activation = false;
  }
}

/**
 * A finger lifted off an element that never clicks, as iOS does for a tap on the canvas:
 * the touch ends inside the tap's activation.
 */
export function touchEnd(selector: string) {
  if (!visible(selector)) throw new Error(`${selector} is not visible`);
  activation = true;
  try {
    $(selector).dispatchEvent(
      new Event('touchend', { bubbles: true, cancelable: true }),
    );
  } finally {
    activation = false;
  }
}

/**
 * A value picked in a select or set on a slider (by keys or drag), like Playwright's
 * `selectOption`: the page hears input and change. Only enabled fields and options.
 */
export function choose(selector: string, value: string) {
  const field = $<HTMLSelectElement | HTMLInputElement>(selector);
  if (!visible(selector)) throw new Error(`${selector} is not visible`);
  if (field.disabled) throw new Error(`${selector} is disabled`);
  if (
    field instanceof HTMLSelectElement &&
    !Array.from(field.options).some(
      (option) => option.value === value && !option.disabled,
    )
  )
    throw new Error(`${selector} offers no enabled ${value}`);
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * A key held or released on the focused element, like `page.keyboard.down/up`. Enter on
 * a focused button clicks it, as a browser does, unless the page took the key.
 */
export function key(
  type: 'keydown' | 'keyup',
  code: 'Space' | 'Escape' | 'Tab' | 'Enter',
  shiftKey = false,
) {
  const target = document.activeElement ?? document.body;
  const unhandled = target.dispatchEvent(
    new KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      code,
      key: code === 'Space' ? ' ' : code,
      shiftKey,
    }),
  );
  if (
    unhandled &&
    type === 'keydown' &&
    code === 'Enter' &&
    target instanceof HTMLButtonElement &&
    !target.disabled
  )
    target.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }),
    );
}

/** A tilt reading: Chromium exposes the sensor events, tests fire them. */
export function orient(gamma: number, beta: number) {
  const event = new Event('deviceorientation');
  Object.defineProperties(event, {
    gamma: { value: gamma },
    beta: { value: beta },
  });
  window.dispatchEvent(event);
}

/** Gyroscope readings, one event per rate, in °/s of pitch. */
export function spin(rates: number[]) {
  for (const rate of rates) {
    const event = new Event('devicemotion');
    Object.defineProperty(event, 'rotationRate', {
      value: {
        alpha: 0,
        beta: rate * FISHING.motion.gesture.pitchSign,
        gamma: 0,
      },
    });
    window.dispatchEvent(event);
  }
}
