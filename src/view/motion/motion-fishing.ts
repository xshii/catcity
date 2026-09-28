import './motion-fishing.css';
import type { AnglingRun } from '../../minigames/angling';
import {
  fishPoint,
  motionBounds,
  motionSchedule,
  ringRadius,
} from '../../minigames/angling-motion';
import { FISHING } from '../../content/fishing';
import { WATER_VIEW } from '../art/water-view';
import type { FishingScreen } from '../fishing/screen';
import type { Trace } from '../../platform/device-log';
import {
  canPlay,
  motionActive,
  type FishingViewStore,
  type Preference,
} from '../fishing/view-state';
import { OrientationTracker } from './orientation';
import {
  calibrateSwing,
  parseTuning,
  screenRates,
  type SpinSample,
} from './calibrate';
import { createRodGestures, DEFAULT_TUNING, type RodTuning } from './rod';
import { createRodTip } from './tip';

/** Per-device choice; never part of the world or a save. */
const PREFERENCE_KEY = 'cat-city.fishing-input';
/** Per-device swing calibration; never part of the world or a save. */
const TUNING_KEY = 'cat-city.rod-tuning';
/** How long the calibration result stays on screen. */
const NOTICE_MS = 3000;
interface PermissionApi {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/** Motion facts read once at mount: the stored choice and what this device must ask. */
export function motionStartup() {
  return {
    preference: readPreference(),
    needsPermission:
      typeof (window.DeviceMotionEvent as PermissionApi | undefined)
        ?.requestPermission === 'function',
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
  };
}

export interface MotionFishingDeps {
  /** Preference, capability, calibration and pause live in the fishing view state. */
  view: FishingViewStore;
  stage: HTMLElement;
  /** The canvas box: the overlay's 100×100 water plane scales with it. */
  plane: HTMLElement;
  settings: HTMLElement;
  /** The ready-to-cast area: while motion is off, a way back to it lives here. */
  readySlot: HTMLElement;
  getRun: () => AnglingRun | null;
  /** Live aim and power while no run exists, so the water preview follows the rod. */
  previewAim: (aim: { direction: number; power: number }) => void;
  /** Starts a motion run and casts it at once; false if Core rejected it. */
  cast: (direction: number, power: number) => boolean;
  strike: () => void;
  vibrate: (pattern: number | number[]) => void;
  /** Debug log of gestures and calibration; raw sensor readings are logged by the log itself. */
  trace: Trace;
}

/**
 * Motion fishing (spec 030): the phone is the rod. Default on capable phones; the frozen
 * button flow is used otherwise. The View only reports gestures and the rod tip; Core
 * decides nibbles, the bite window, the fish ring and the catch. What shows is decided
 * by `fishingScreen` (spec 015); this module keeps only continuous sensor readings.
 */
export function mountMotionFishing(deps: MotionFishingDeps) {
  const { view } = deps;
  const tracker = new OrientationTracker();
  let tuning = readTuning();
  let gestures = createRodGestures(tuning);
  deps.trace('tuning', { ...tuning });
  /** Spin samples while calibrating; the view state says whether calibration is on. */
  let calibration: SpinSample[] | null = null;
  let noticeTimer = 0;
  const tip = createRodTip();
  let tilt: { x: number; y: number } | null = null;
  let rebase = true;
  let finger: { x: number; y: number; until: number } | null = null;
  let lastRun: string | null = null;
  let lastPhase = '';
  let cuedNibble = -1;
  let power = 50;
  let lastPreview = '';
  let calibrationTimer = 0;

  const overlay = document.createElement('div');
  overlay.id = 'motion-fishing';
  overlay.hidden = true;
  overlay.innerHTML =
    '<p id="motion-fishing-hint" class="motion-fishing-hint" role="status"></p>' +
    '<strong id="motion-bite" class="motion-bite" hidden aria-live="assertive">！</strong>' +
    '<span id="motion-ring" class="motion-ring" hidden aria-hidden="true"></span>' +
    '<span id="motion-tip" class="motion-tip" hidden></span>' +
    '<div id="motion-power" class="motion-power" hidden role="meter" aria-label="抛竿力度" aria-valuemin="0" aria-valuemax="100"><span class="motion-power-band"></span><i class="motion-power-level"></i></div>' +
    '<progress id="motion-hold" class="motion-hold" max="100" value="0" hidden aria-label="遛鱼进度"></progress>' +
    '<button id="motion-calibrate" class="motion-calibrate" hidden>校准甩竿</button>';
  deps.plane.append(overlay);
  const $ = <T extends HTMLElement>(id: string) =>
    overlay.querySelector<T>(`#${id}`)!;
  const ring = $('motion-ring');
  // The precise-cast band on the power meter comes from the cast rules.
  const band = FISHING.cast.precisionPower;
  $('motion-power').style.setProperty('--band-low', `${band.min}%`);
  $('motion-power').style.setProperty('--band-size', `${band.max - band.min}%`);

  const card = document.createElement('div');
  card.id = 'motion-onboarding';
  card.className = 'motion-onboarding';
  card.hidden = true;
  card.innerHTML =
    '<p>开启体感钓鱼：面向水面，左右瞄准，慢慢俯仰调力度，快速下甩抛竿，看到"！"快速上扬。</p>' +
    '<button id="motion-enable" class="primary">开启体感钓鱼</button>' +
    '<button id="motion-use-buttons" class="quiet">改用按钮</button>';
  deps.stage.append(card);

  const toggle = document.createElement('button');
  toggle.id = 'motion-mode-toggle';
  deps.settings.append(toggle);
  const quick = document.createElement('button');
  quick.id = 'motion-quick';
  quick.className = 'quiet';
  deps.readySlot.append(quick);
  quick.addEventListener('click', () => void enable());

  const active = () => motionActive(view.get());
  const playable = () => canPlay(view.get());
  const choose = (preference: Preference) => {
    savePreference(preference);
    view.dispatch({ type: 'preference', preference });
  };
  const listen = () => {
    window.addEventListener('devicemotion', onMotion);
    window.addEventListener('deviceorientation', onOrientation);
  };
  async function enable() {
    choose('motion');
    if (!window.isSecureContext || !('DeviceMotionEvent' in window))
      return view.dispatch({ type: 'capability', capability: 'unsupported' });
    if (view.get().motion.needsPermission) {
      // Both requests must start inside the click that triggered them.
      const motion = (window.DeviceMotionEvent as PermissionApi)
        .requestPermission!();
      const orientation = (
        window.DeviceOrientationEvent as PermissionApi | undefined
      )?.requestPermission?.();
      const results = await Promise.all([
        motion.catch(() => 'denied' as const),
        orientation?.catch(() => 'denied' as const) ?? 'granted',
      ]);
      if (results.some((result) => result !== 'granted'))
        return view.dispatch({ type: 'capability', capability: 'denied' });
      view.dispatch({ type: 'grant' });
    }
    listen();
  }
  card
    .querySelector('#motion-enable')!
    .addEventListener('click', () => void enable());
  card
    .querySelector('#motion-use-buttons')!
    .addEventListener('click', () => choose('buttons'));
  toggle.addEventListener('click', () => {
    if (active()) choose('buttons');
    else void enable();
  });
  // Capable browsers without a permission prompt start listening right away.
  const startup = view.get().motion;
  if (
    startup.preference === 'motion' &&
    !startup.needsPermission &&
    window.isSecureContext
  )
    listen();

  function onOrientation(event: DeviceOrientationEvent) {
    const angle = screen.orientation?.angle ?? 0;
    const next = tracker.sample(event.beta, event.gamma, angle);
    if (!next) return;
    tilt = next;
    if (rebase) {
      tip.calibrate(next);
      rebase = false;
      // Replays need the pose the rod tip is measured from.
      deps.trace('rebase', { t: event.timeStamp });
    }
    if (active() && playable() && !deps.getRun()) {
      power = tip.power(next);
      const preview = { direction: tip.aim(next), power };
      const key = `${preview.direction}/${preview.power}`;
      if (key !== lastPreview) deps.previewAim(preview);
      lastPreview = key;
    }
  }
  function onMotion(event: DeviceMotionEvent) {
    const reading = event.rotationRate?.beta;
    if (typeof reading !== 'number' || !Number.isFinite(reading)) return;
    // Rates in the screen's axes, so a landscape hold pitches the same way.
    const rates = screenRates(
      event.rotationRate,
      screen.orientation?.angle ?? 0,
    );
    if (calibration) {
      calibration.push({ t: event.timeStamp, ...rates });
      return;
    }
    const rate = rates[tuning.axis];
    if (view.get().motion.capability !== 'ready')
      view.dispatch({ type: 'capability', capability: 'ready' });
    if (!active() || !playable()) return gestures.reset();
    const run = deps.getRun();
    if (run && view.get().paused) return gestures.reset();
    const want = !run
      ? 'cast'
      : run.phase === 'waiting' || run.phase === 'hook'
        ? 'lift'
        : null;
    if (!want) return gestures.reset();
    const gesture = gestures.push(
      { t: event.timeStamp, pitchRate: rate, power },
      want,
    );
    if (gesture) deps.trace('gesture', { t: event.timeStamp, gesture });
    if (gesture?.kind === 'cast') {
      // Without orientation readings the cast goes straight ahead.
      if (deps.cast(tilt ? tip.aim(tilt) : 0, gesture.power)) deps.vibrate(20);
    } else if (gesture?.kind === 'lift') deps.strike();
  }

  // Tapping the water strikes too, so a lost sensor stream never strands a bite.
  overlay.addEventListener('click', () => {
    const run = deps.getRun();
    if (
      run?.mode === 'motion' &&
      !view.get().paused &&
      (run.phase === 'waiting' || run.phase === 'hook')
    )
      deps.strike();
  });

  // One-tap calibration: two flicks down, then the rod follows this phone and player.
  const endCalibration = () => {
    window.clearTimeout(calibrationTimer);
    calibration = null;
  };
  const showNotice = (text: string) => {
    window.clearTimeout(noticeTimer);
    view.dispatch({ type: 'notice', text });
    noticeTimer = window.setTimeout(
      () => view.dispatch({ type: 'notice', text: null }),
      NOTICE_MS,
    );
  };
  $('motion-calibrate').addEventListener('click', (event) => {
    event.stopPropagation();
    endCalibration();
    view.dispatch({ type: 'calibrating', on: true });
    // The view state refuses calibration unless motion is active and playable.
    if (!view.get().motion.calibrating) return;
    calibration = [];
    gestures.reset();
    calibrationTimer = window.setTimeout(() => {
      const result = calibrateSwing(calibration ?? []);
      deps.trace('calibration', {
        samples: calibration?.length ?? 0,
        result,
      });
      endCalibration();
      view.dispatch({ type: 'calibrating', on: false });
      if (result) {
        tuning = result.tuning;
        gestures = createRodGestures(tuning);
        saveTuning(tuning);
      }
      showNotice(
        result
          ? `校准完成：下甩 ${result.peak}°/s`
          : '没感到两次一致的下甩，再试一次',
      );
    }, FISHING.motion.gesture.calibration.windowMs);
  });
  // The view state ends calibration when play or motion stops; drop its samples then.
  view.subscribe((state) => {
    if (!state.motion.calibrating && calibration) endCalibration();
  });

  /** Keep the plane square over the canvas's open water, so drawing matches Core. */
  const place = () => {
    const canvas = deps.plane.querySelector('canvas');
    if (!canvas) return;
    const box = deps.plane.getBoundingClientRect();
    const art = canvas.getBoundingClientRect();
    const WATER = WATER_VIEW.plane;
    const side = art.width * WATER.side;
    overlay.style.left = `${art.left - box.left + art.width * WATER.left}px`;
    overlay.style.top = `${art.top - box.top + art.height * WATER.top}px`;
    overlay.style.width = overlay.style.height = `${side}px`;
  };
  new ResizeObserver(place).observe(deps.plane);

  // Finger fallback for the fight: dragging on the water moves the rod tip.
  overlay.addEventListener('pointermove', (event) => {
    if (deps.getRun()?.phase !== 'fight') return;
    const box = overlay.getBoundingClientRect();
    finger = {
      x: Math.round(((event.clientX - box.left) / box.width) * 100),
      y: Math.round(((event.clientY - box.top) / box.height) * 100),
      until: performance.now() + 1000,
    };
  });

  function point(): { x: number; y: number } | null {
    if (finger && performance.now() < finger.until)
      return {
        x: Math.min(100, Math.max(0, finger.x)),
        y: Math.min(100, Math.max(0, finger.y)),
      };
    return tilt ? tip.point(tilt) : null;
  }

  /** Applies the screen model; decides nothing itself. */
  function apply(screen: FishingScreen, run: AnglingRun | null) {
    const motionRun = run?.mode === 'motion' ? run : null;
    card.hidden = !screen.motionCard;
    toggle.textContent = screen.toggle.label;
    toggle.setAttribute('aria-pressed', String(screen.toggle.pressed));
    toggle.disabled = screen.toggle.disabled;
    quick.hidden = !screen.quick.visible;
    quick.textContent = screen.quick.label;
    quick.disabled = screen.quick.disabled;
    overlay.hidden = !screen.overlay;
    if (overlay.hidden) return;
    place();
    if (
      (motionRun?.id ?? null) !== lastRun ||
      (motionRun?.phase ?? '') !== lastPhase
    ) {
      // A new run or phase re-centres the rod tip on the current pose.
      if (motionRun?.phase === 'fight' || !motionRun) rebase = true;
      lastRun = motionRun?.id ?? null;
      lastPhase = motionRun?.phase ?? '';
      cuedNibble = -1;
    }
    const phase = screen.overlayPhase;
    overlay.dataset.phase = phase;
    $('motion-calibrate').hidden = !screen.calibrateButton;
    const meter = $('motion-power');
    meter.hidden = !screen.powerMeter;
    meter.style.setProperty('--power', `${power}%`);
    meter.setAttribute('aria-valuenow', String(power));
    $('motion-fishing-hint').textContent = screen.hint;
    $('motion-bite').hidden = phase !== 'hook';
    if (motionRun?.phase === 'waiting') {
      const nibble = motionSchedule(motionRun).nibbles.findIndex(
        (at) =>
          motionRun.phaseTick >= at &&
          motionRun.phaseTick < at + FISHING.motion.nibbleTicks,
      );
      overlay.classList.toggle('nibble', nibble !== -1);
      if (nibble !== -1 && nibble !== cuedNibble) {
        cuedNibble = nibble;
        deps.vibrate(15);
      }
    } else overlay.classList.remove('nibble');
    const fighting = motionRun?.phase === 'fight';
    ring.hidden = !fighting;
    $('motion-tip').hidden = !fighting;
    $('motion-hold').hidden = !fighting;
    if (!fighting || !motionRun) return;
    // Draw the tick Core judges next: it steps first, then tests the rod tip.
    const next = { ...motionRun, phaseTick: motionRun.phaseTick + 1 };
    const fish = fishPoint(next, next.phaseTick);
    const radius = ringRadius(next);
    const rod = point() ?? { x: 50, y: 50 };
    const inside = (rod.x - fish.x) ** 2 + (rod.y - fish.y) ** 2 <= radius ** 2;
    // The overlay is the square 100×100 water plane; sizes are percentages of it.
    ring.style.left = `${fish.x}%`;
    ring.style.top = `${fish.y}%`;
    ring.style.width = `${radius * 2}%`;
    ring.classList.toggle('inside', inside);
    ring.classList.toggle('warning', fish.warning);
    ring.classList.toggle('dashing', fish.dashing);
    const tipDot = $('motion-tip');
    tipDot.style.left = `${rod.x}%`;
    tipDot.style.top = `${rod.y}%`;
    $<HTMLProgressElement>('motion-hold').value = Math.round(
      (motionRun.hold / motionBounds(motionRun).holdTarget) * 100,
    );
  }

  return { point, apply };
}

function readTuning(): RodTuning {
  try {
    return (
      parseTuning(JSON.parse(localStorage.getItem(TUNING_KEY) ?? 'null')) ??
      DEFAULT_TUNING
    );
  } catch {
    return DEFAULT_TUNING;
  }
}
function saveTuning(tuning: RodTuning) {
  try {
    localStorage.setItem(TUNING_KEY, JSON.stringify(tuning));
  } catch {
    // Private mode or blocked storage: the calibration lasts for this page only.
  }
}
function readPreference(): Preference {
  try {
    return localStorage.getItem(PREFERENCE_KEY) === 'buttons'
      ? 'buttons'
      : 'motion';
  } catch {
    return 'motion';
  }
}
function savePreference(preference: Preference) {
  try {
    localStorage.setItem(PREFERENCE_KEY, preference);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}
