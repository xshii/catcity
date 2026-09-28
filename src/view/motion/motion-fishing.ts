import './motion-fishing.css';
import type { AnglingRun } from '../../minigames/angling';
import {
  fishPoint,
  motionBounds,
  motionSchedule,
  ringRadius,
} from '../../minigames/angling-motion';
import { FISHING } from '../../content/fishing';
import { OrientationTracker } from './orientation';
import { calibrateSwing, parseTuning, type SpinSample } from './calibrate';
import { createRodGestures, DEFAULT_TUNING, type RodTuning } from './rod';
import { createRodTip } from './tip';

type Capability = 'unknown' | 'ready' | 'denied' | 'unsupported';
type Preference = 'motion' | 'buttons';
/** Per-device choice; never part of the world or a save. */
const PREFERENCE_KEY = 'cat-city.fishing-input';
/** Per-device swing calibration; never part of the world or a save. */
const TUNING_KEY = 'cat-city.rod-tuning';
/** How long the calibration result stays on screen. */
const NOTICE_MS = 3000;
/**
 * Open water in the river art (x 210–609, y 134–558 of the 640 canvas), as shares of the
 * square canvas: a square as large as the water allows, spilling a little onto the west bank.
 */
const WATER = { left: 0.35, top: 0.2, side: 0.6 };

interface PermissionApi {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

export interface MotionFishingDeps {
  stage: HTMLElement;
  /** The canvas box: the overlay's 100×100 water plane scales with it. */
  plane: HTMLElement;
  settings: HTMLElement;
  getRun: () => AnglingRun | null;
  /** River on screen, no tools open, page focused. */
  canPlay: () => boolean;
  /** A paused run ignores gestures until the player resumes it. */
  isPaused: () => boolean;
  /** Live aim while no run exists, so the water preview follows the tilt. */
  previewAim: (direction: number) => void;
  /** Starts a motion run and casts it at once; false if Core rejected it. */
  cast: (direction: number, power: number) => boolean;
  strike: () => void;
  vibrate: (pattern: number | number[]) => void;
  onChange: () => void;
}

/**
 * Motion fishing (spec 030): the phone is the rod. Default on capable phones; the frozen
 * button flow is used otherwise. The View only reports gestures and the rod tip; Core
 * decides nibbles, the bite window, the fish ring and the catch.
 */
export function mountMotionFishing(deps: MotionFishingDeps) {
  let preference: Preference = readPreference();
  let capability: Capability = 'unknown';
  const tracker = new OrientationTracker();
  let tuning = readTuning();
  let gestures = createRodGestures(tuning);
  let calibration: SpinSample[] | null = null;
  let notice: { text: string; until: number } | null = null;
  const tip = createRodTip();
  let tilt: { x: number; y: number } | null = null;
  let rebase = true;
  let finger: { x: number; y: number; until: number } | null = null;
  let lastRun: string | null = null;
  let lastPhase = '';
  let cuedNibble = -1;
  let lastAim: number | null = null;

  const overlay = document.createElement('div');
  overlay.id = 'motion-fishing';
  overlay.hidden = true;
  overlay.innerHTML =
    '<p id="motion-fishing-hint" class="motion-fishing-hint" role="status"></p>' +
    '<strong id="motion-bite" class="motion-bite" hidden aria-live="assertive">！</strong>' +
    '<span id="motion-ring" class="motion-ring" hidden aria-hidden="true"></span>' +
    '<span id="motion-tip" class="motion-tip" hidden></span>' +
    '<progress id="motion-hold" class="motion-hold" max="100" value="0" hidden aria-label="遛鱼进度"></progress>' +
    '<button id="motion-calibrate" class="motion-calibrate" hidden>校准甩竿</button>';
  deps.plane.append(overlay);
  const $ = <T extends HTMLElement>(id: string) =>
    overlay.querySelector<T>(`#${id}`)!;
  const ring = $('motion-ring');

  const card = document.createElement('div');
  card.id = 'motion-onboarding';
  card.className = 'motion-onboarding';
  card.hidden = true;
  card.innerHTML =
    '<p>开启体感钓鱼：倾斜瞄准，后扬再前压甩竿，看到"！"快速上扬。</p>' +
    '<button id="motion-enable" class="primary">开启体感钓鱼</button>' +
    '<button id="motion-use-buttons" class="quiet">改用按钮</button>';
  deps.stage.append(card);

  const toggle = document.createElement('button');
  toggle.id = 'motion-mode-toggle';
  deps.settings.append(toggle);

  const needsPermission = () =>
    typeof (window.DeviceMotionEvent as PermissionApi | undefined)
      ?.requestPermission === 'function';
  const listen = () => {
    window.addEventListener('devicemotion', onMotion);
    window.addEventListener('deviceorientation', onOrientation);
  };
  async function enable() {
    preference = 'motion';
    savePreference(preference);
    if (!window.isSecureContext || !('DeviceMotionEvent' in window)) {
      capability = 'unsupported';
      return deps.onChange();
    }
    if (needsPermission()) {
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
      if (results.some((result) => result !== 'granted')) {
        capability = 'denied';
        return deps.onChange();
      }
      // Granted: the first sensor sample marks the device ready.
      capability = 'unknown';
    }
    listen();
    deps.onChange();
  }
  card
    .querySelector('#motion-enable')!
    .addEventListener('click', () => void enable());
  card.querySelector('#motion-use-buttons')!.addEventListener('click', () => {
    preference = 'buttons';
    savePreference(preference);
    deps.onChange();
  });
  toggle.addEventListener('click', () => {
    if (active()) {
      preference = 'buttons';
      savePreference(preference);
      deps.onChange();
    } else void enable();
  });
  // Capable browsers without a permission prompt start listening right away.
  if (preference === 'motion' && !needsPermission() && window.isSecureContext)
    listen();

  function onOrientation(event: DeviceOrientationEvent) {
    const angle = screen.orientation?.angle ?? 0;
    const next = tracker.sample(event.beta, event.gamma, angle);
    if (!next) return;
    tilt = next;
    if (rebase) {
      tip.calibrate(next);
      rebase = false;
    }
    if (active() && deps.canPlay() && !deps.getRun()) {
      const aim = tip.aim(next);
      if (aim !== lastAim) deps.previewAim(aim);
      lastAim = aim;
    }
  }
  function onMotion(event: DeviceMotionEvent) {
    if (calibration) {
      const spin = event.rotationRate;
      calibration.push({
        t: event.timeStamp,
        alpha: spin?.alpha ?? 0,
        beta: spin?.beta ?? 0,
        gamma: spin?.gamma ?? 0,
      });
      return;
    }
    const rate = event.rotationRate?.[tuning.axis];
    if (typeof rate !== 'number' || !Number.isFinite(rate)) return;
    if (capability !== 'ready') {
      capability = 'ready';
      deps.onChange();
    }
    if (!active() || !deps.canPlay()) return gestures.reset();
    const run = deps.getRun();
    if (run && deps.isPaused()) return gestures.reset();
    const want = !run
      ? 'cast'
      : run.phase === 'waiting' || run.phase === 'hook'
        ? 'lift'
        : null;
    if (!want) return gestures.reset();
    const gesture = gestures.push(
      { t: event.timeStamp, pitchRate: rate },
      want,
    );
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
      !deps.isPaused() &&
      (run.phase === 'waiting' || run.phase === 'hook')
    )
      deps.strike();
  });

  // One-tap calibration: two swings, then the rod follows this phone and this player.
  $('motion-calibrate').addEventListener('click', (event) => {
    event.stopPropagation();
    calibration = [];
    gestures.reset();
    deps.onChange();
    window.setTimeout(() => {
      const result = calibrateSwing(calibration ?? []);
      calibration = null;
      if (result) {
        tuning = result.tuning;
        gestures = createRodGestures(tuning);
        saveTuning(tuning);
      }
      notice = {
        text: result
          ? `校准完成：后扬 ${result.peaks.backswing}°/s · 前甩 ${result.peaks.forward}°/s`
          : '没感到甩动，再试一次',
        until: performance.now() + NOTICE_MS,
      };
      window.setTimeout(deps.onChange, NOTICE_MS);
      deps.onChange();
    }, FISHING.motion.gesture.calibration.windowMs);
  });

  /** Keep the plane square over the canvas's open water, so drawing matches Core. */
  const place = () => {
    const canvas = deps.plane.querySelector('canvas');
    if (!canvas) return;
    const box = deps.plane.getBoundingClientRect();
    const art = canvas.getBoundingClientRect();
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

  function active() {
    return preference === 'motion' && capability === 'ready';
  }
  function point(): { x: number; y: number } | null {
    if (finger && performance.now() < finger.until)
      return {
        x: Math.min(100, Math.max(0, finger.x)),
        y: Math.min(100, Math.max(0, finger.y)),
      };
    return tilt ? tip.point(tilt) : null;
  }

  function refresh() {
    const run = deps.getRun();
    const motionRun = run?.mode === 'motion' ? run : null;
    // Only phones get the one-tap prompt; desktops default to the button flow. A motion
    // run restored after a reload needs the tap again, or its bite could not be struck.
    card.hidden =
      !(motionRun || (preference === 'motion' && !run)) ||
      capability !== 'unknown' ||
      !needsPermission() ||
      !window.matchMedia('(pointer: coarse)').matches ||
      !deps.canPlay();
    toggle.textContent = active()
      ? '钓鱼操作：体感 ✓（点此改用按钮）'
      : capability === 'unsupported'
        ? '此设备或连接不支持体感（需 HTTPS 与陀螺仪）'
        : capability === 'denied'
          ? '体感未获授权（点此重试）'
          : preference === 'motion'
            ? '开启体感钓鱼'
            : '钓鱼操作：按钮（点此开启体感）';
    toggle.setAttribute('aria-pressed', String(active()));
    toggle.disabled = capability === 'unsupported';
    overlay.hidden = !(active() || motionRun) || !deps.canPlay();
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
    const phase = motionRun?.phase ?? 'aim';
    overlay.dataset.phase = phase;
    $('motion-calibrate').hidden = !!motionRun || !active() || !!calibration;
    if (notice && performance.now() >= notice.until) notice = null;
    $('motion-fishing-hint').textContent = calibration
      ? '校准：后扬再前甩，做两次'
      : notice && !motionRun
        ? notice.text
        : motionRun && deps.isPaused()
          ? '已暂停 · 点「继续钓鱼」再继续'
          : phase === 'aim'
            ? '左右倾斜瞄准，后扬再前压甩竿'
            : phase === 'waiting'
              ? '拿稳鱼竿，等"！"再上扬'
              : phase === 'hook'
                ? '快速上扬提竿！'
                : phase === 'fight'
                  ? (motionRun?.phaseTick ?? 0) <=
                    FISHING.motion.fight.graceTicks
                    ? '稳住，竿尖放进鱼圈'
                    : '倾斜手机，让竿尖追住鱼圈'
                  : '';
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

  refresh();
  return { active, point, refresh };
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
