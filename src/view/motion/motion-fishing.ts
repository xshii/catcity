import './motion-fishing.css';
import type { AnglingRun } from '../../minigames/angling';
import {
  fishPath,
  motionBounds,
  ringRadius,
} from '../../minigames/angling-motion';
import { FISHING } from '../../content/fishing';
import { fishShadow } from '../art/illustrations';
import {
  aimedSteps,
  askSensors,
  motionNibble,
  motionWant,
  SCREEN_COPY,
  tapStrikes,
  wantsMotion,
  type FishingScreen,
} from '../fishing/screen';
import { followWaterPlane } from '../fishing/water-plane';
import { logTime, type Trace } from '../../platform/device-log';
import { readJsonPref, readPref, savePref } from '../../platform/local-prefs';
import {
  GUIDE_STEPS,
  type FishingViewStore,
  type GuideStep,
  type Preference,
} from '../fishing/view-state';
import { OrientationTracker } from './orientation';
import {
  calibrateSwing,
  parseTuning,
  rateAxesFor,
  screenRates,
  type SpinSample,
} from './calibrate';
import { createRodGestures, DEFAULT_TUNING, type RodTuning } from './rod';
import { centreOnPhase, createRodTip } from './tip';

/** Per-device choice; never part of the world or a save. */
const PREFERENCE_KEY = 'cat-city.fishing-input';
/**
 * Per-device swing calibration; never part of the world or a save. Version 2: earlier
 * calibrations on iPhones named the rate axes wrongly and are ignored.
 */
const TUNING_KEY = 'cat-city.rod-tuning.v2';
/** Per-device first-cast guide progress: the step to learn next, or `done`. */
const GUIDE_KEY = 'cat-city.fishing-guide';
/** How long the calibration result stays on screen. */
const NOTICE_MS = 3000;
const FEEL = FISHING.motion.feel;
const PLANE_CENTRE = FISHING.motion.planeCentre;
const POWER_COPY = SCREEN_COPY.power;
/** The screen's rotation from its natural orientation, in degrees. */
const screenAngle = () => screen.orientation?.angle ?? 0;
const clampPlane = (value: number) => Math.min(100, Math.max(0, value));
interface PermissionApi {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/**
 * Motion facts read once at mount: the stored choice, the guide's progress, whether this
 * device ever calibrated, and what it must ask.
 */
export function motionStartup() {
  return {
    preference: readPreference(),
    guide: readGuide(),
    autoCalibrate: parseTuning(readJsonPref(TUNING_KEY)) === null,
    needsPermission:
      typeof (window.DeviceMotionEvent as PermissionApi | undefined)
        ?.requestPermission === 'function',
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
  };
}

export interface MotionFishingDeps {
  /** Preference, capability, calibration and pause live in the fishing view state. */
  view: FishingViewStore;
  /** The canvas box: the overlay's 100×100 water plane scales with it. */
  plane: HTMLElement;
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
  const rateAxes = rateAxesFor(navigator.userAgent, navigator.maxTouchPoints);
  deps.trace('tuning', { ...tuning, rateAxes });
  /** Spin samples while calibrating; the view state says whether calibration is on. */
  let calibration: SpinSample[] | null = null;
  let noticeTimer = 0;
  const tip = createRodTip();
  let tilt: { x: number; y: number } | null = null;
  /** The smoothed rod tip, advanced once per orientation reading. */
  let rodPoint: { x: number; y: number } | null = null;
  let rebase = true;
  /** The pose held when the fish bit, before the lift that strikes it. */
  let bitePose: { x: number; y: number } | null = null;
  let finger: { x: number; y: number; until: number } | null = null;
  /** The motion run and phase last applied, as `id/phase`. */
  let lastRunPhase = '';
  let cuedNibble: number | null = null;
  let power = FISHING.input.maxPower / 2;
  let lastPreview = '';
  let calibrationTimer = 0;
  /** Event time until which flicks still belong to the calibration just finished. */
  let settleUntil = -Infinity;

  const overlay = document.createElement('div');
  overlay.id = 'motion-fishing';
  overlay.hidden = true;
  overlay.innerHTML =
    '<p id="motion-fishing-hint" class="motion-fishing-hint" role="status"></p>' +
    `<button id="motion-guide-skip" class="motion-guide-skip" hidden>${SCREEN_COPY.guide.skip}</button>` +
    '<strong id="motion-bite" class="motion-bite" hidden aria-live="assertive">！</strong>' +
    `<span id="motion-fish" class="motion-fish" hidden aria-hidden="true">${fishShadow()}</span>` +
    '<span id="motion-ring" class="motion-ring" hidden aria-hidden="true"></span>' +
    `<span id="motion-power" class="motion-power" hidden role="meter" aria-label="${POWER_COPY.label}" aria-valuemin="0" aria-valuemax="${FISHING.input.maxPower}"></span>` +
    '<progress id="motion-hold" class="motion-hold" max="100" value="0" hidden aria-label="遛鱼进度"></progress>';
  deps.plane.append(overlay);
  const $ = <T extends HTMLElement>(id: string) =>
    overlay.querySelector<T>(`#${id}`)!;
  const el = {
    hint: $('motion-fishing-hint'),
    bite: $('motion-bite'),
    fish: $('motion-fish'),
    ring: $('motion-ring'),
    power: $('motion-power'),
    hold: $<HTMLProgressElement>('motion-hold'),
    skip: $('motion-guide-skip'),
  };
  // The water shows the power as the landing arc (spec 033 F5); the meter reads it out.
  const band = FISHING.cast.precisionPower;

  const choose = (preference: Preference) => {
    savePref(PREFERENCE_KEY, preference);
    view.dispatch({ type: 'preference', preference });
  };
  const listen = () => {
    window.addEventListener('devicemotion', onMotion);
    window.addEventListener('deviceorientation', onOrientation);
  };
  /** Asks for sensor access where the browser must, then listens for readings. */
  async function request() {
    if (view.get().motion.needsPermission) {
      // Both requests must start inside the tap that triggered them.
      const motion = (window.DeviceMotionEvent as PermissionApi)
        .requestPermission!();
      const orientation = (
        window.DeviceOrientationEvent as PermissionApi | undefined
      )?.requestPermission?.();
      view.dispatch({ type: 'ask' });
      stopAsking();
      const results = await Promise.all([
        motion.catch(() => 'denied' as const),
        orientation?.catch(() => 'denied' as const) ?? 'granted',
      ]);
      if (results.some((result) => result !== 'granted'))
        return view.dispatch({ type: 'capability', capability: 'denied' });
      view.dispatch({ type: 'grant' });
      // The player may have chosen buttons while the prompt was up.
      if (!wantsMotion(view.get(), deps.getRun())) return;
    }
    listen();
  }
  const startup = view.get().motion;
  // Without HTTPS or the sensor events, motion cannot work: buttons, without a word.
  if (!window.isSecureContext || !('DeviceMotionEvent' in window))
    view.dispatch({ type: 'capability', capability: 'unsupported' });
  // Capable browsers without a permission prompt start listening right away.
  else if (startup.preference === 'motion' && !startup.needsPermission)
    listen();
  // Motion is the default (spec 034): a phone that must ask does so on its first tap on
  // the river, after that tap's own handler (so the tap that opens the river counts) and
  // inside it, as iOS requires. Touch ends too, for taps on the water that never click.
  const onTap = (event: Event) => {
    if (askSensors(view.get(), deps.getRun()) && userActivated(event))
      void request();
  };
  const TAPS = ['click', 'touchend'];
  /** Asked, by a tap or from the settings: taps never ask again on this page. */
  const stopAsking = () => {
    for (const type of TAPS) window.removeEventListener(type, onTap);
  };
  if (startup.needsPermission && startup.coarsePointer)
    for (const type of TAPS) window.addEventListener(type, onTap);

  function onOrientation(event: DeviceOrientationEvent) {
    const next = tracker.sample(event.beta, event.gamma, screenAngle());
    if (!next) return;
    tilt = next;
    if (rebase) {
      tip.calibrate(next);
      rebase = false;
      // Replays need the pose the rod tip is measured from.
      deps.trace('rebase', { t: logTime(event.timeStamp) });
    }
    // One smoothing step per reading: ticks and drawing read the same point.
    rodPoint = tip.point(next);
    if (motionWant(view.get(), deps.getRun()) === 'cast') {
      power = tip.power(next);
      const preview = { direction: tip.aim(next), power };
      const key = `${preview.direction}/${preview.power}`;
      if (key !== lastPreview) {
        deps.previewAim(preview);
        for (const did of aimedSteps(preview))
          view.dispatch({ type: 'guide', did });
      }
      lastPreview = key;
    }
  }
  function onMotion(event: DeviceMotionEvent) {
    const reading = event.rotationRate?.beta;
    if (typeof reading !== 'number' || !Number.isFinite(reading)) return;
    // Rates in the screen's axes, so a landscape hold pitches the same way.
    const rates = screenRates(event.rotationRate, screenAngle(), rateAxes);
    if (calibration) {
      calibration.push({ t: event.timeStamp, ...rates });
      return;
    }
    if (event.timeStamp < settleUntil) return gestures.settle();
    if (view.get().motion.capability !== 'ready')
      view.dispatch({ type: 'capability', capability: 'ready' });
    const want = motionWant(view.get(), deps.getRun());
    if (!want) return gestures.reset();
    const gesture = gestures.push(
      { t: event.timeStamp, rate: rates[tuning.axis], power },
      want,
    );
    if (gesture)
      deps.trace('gesture', { t: logTime(event.timeStamp), gesture });
    if (gesture?.kind === 'cast') {
      // Without orientation readings the cast goes straight ahead.
      if (deps.cast(tilt ? tip.aim(tilt) : 0, gesture.power)) {
        deps.vibrate(FEEL.castVibrateMs);
        view.dispatch({ type: 'guide', did: 'cast' });
      }
    } else if (gesture?.kind === 'lift') strike();
  }
  /** A strike on the "!" hooks the fish: the guide's lift step. */
  function strike() {
    const hooked = deps.getRun()?.phase === 'hook';
    deps.strike();
    if (hooked) view.dispatch({ type: 'guide', did: 'strike' });
  }

  overlay.addEventListener('click', () => {
    if (tapStrikes(view.get(), deps.getRun())) strike();
  });
  el.skip.addEventListener('click', (event) => {
    event.stopPropagation();
    view.dispatch({ type: 'skip-guide' });
  });

  // One-tap calibration: two flicks down, then the rod follows this phone and player. The
  // view state turns it on (the settings sheet, or by itself on a device never calibrated).
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
  const startCalibration = () => {
    const samples: SpinSample[] = [];
    calibration = samples;
    gestures.reset();
    calibrationTimer = window.setTimeout(() => {
      const result = calibrateSwing(samples);
      deps.trace('calibration', { samples: samples.length, result });
      settleUntil =
        performance.now() + FISHING.motion.gesture.calibration.settleMs;
      endCalibration();
      view.dispatch({ type: 'calibrating', on: false });
      if (result) {
        tuning = result.tuning;
        gestures = createRodGestures(tuning);
        savePref(TUNING_KEY, JSON.stringify(tuning));
      }
      showNotice(
        result
          ? SCREEN_COPY.calibrate.done(result.peak)
          : SCREEN_COPY.calibrate.failed,
      );
    }, FISHING.motion.gesture.calibration.windowMs);
  };
  // The view state starts calibration, and ends it when play or motion stops (drop its
  // samples then); guide progress is kept for this device.
  let savedGuide = view.get().motion.guide;
  view.subscribe((state) => {
    if (!state.motion.calibrating && calibration) endCalibration();
    if (state.motion.calibrating && !calibration) startCalibration();
    if (state.motion.guide !== savedGuide) {
      savedGuide = state.motion.guide;
      savePref(GUIDE_KEY, savedGuide ?? 'done');
    }
  });

  /** Keep the plane square over the canvas's open water, so drawing matches Core. */
  const place = followWaterPlane(deps.plane, ({ left, top, side }) => {
    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    overlay.style.width = overlay.style.height = `${side}px`;
  });

  // Finger fallback for the fight: dragging on the water moves the rod tip.
  overlay.addEventListener('pointermove', (event) => {
    if (deps.getRun()?.phase !== 'fight') return;
    const box = overlay.getBoundingClientRect();
    finger = {
      x: clampPlane(Math.round(((event.clientX - box.left) / box.width) * 100)),
      y: clampPlane(Math.round(((event.clientY - box.top) / box.height) * 100)),
      until: performance.now() + FEEL.fingerHoldMs,
    };
  });

  function point(): { x: number; y: number } | null {
    if (finger && performance.now() < finger.until)
      return { x: finger.x, y: finger.y };
    return rodPoint;
  }
  /** Where the ring is drawn: the held finger or rod tip, else the plane centre. */
  const ringCentre = () => point() ?? PLANE_CENTRE;

  /** Applies the screen model; decides nothing itself. */
  function apply(model: FishingScreen, run: AnglingRun | null) {
    const motionRun = run?.mode === 'motion' ? run : null;
    overlay.hidden = !model.overlay;
    if (overlay.hidden) return;
    place();
    const runPhase = motionRun ? `${motionRun.id}/${motionRun.phase}` : '';
    if (runPhase !== lastRunPhase) {
      const change = centreOnPhase(motionRun?.phase ?? null, bitePose, tilt);
      bitePose = change.held;
      if (change.centre === 'current') rebase = true;
      else if (change.centre) {
        tip.calibrate(change.centre);
        rodPoint = tilt ? tip.point(tilt) : null;
        deps.trace('rebase-pose', { pose: change.centre });
      }
      // A new fish starts facing right, whichever way the last one swam.
      if (motionRun?.phase === 'fight') el.fish.classList.remove('left');
      lastRunPhase = runPhase;
      cuedNibble = null;
    }
    overlay.dataset.phase = model.overlayPhase;
    el.skip.hidden = !model.guide;
    el.power.hidden = !model.powerMeter;
    el.power.setAttribute('aria-valuenow', String(power));
    el.power.setAttribute(
      'aria-valuetext',
      POWER_COPY.valueText(power, band.min, band.max),
    );
    el.hint.textContent = model.hint;
    el.bite.hidden = !model.bite;
    const nibble = motionNibble(motionRun);
    overlay.classList.toggle('nibble', nibble !== null);
    if (nibble !== null && nibble !== cuedNibble) {
      cuedNibble = nibble;
      deps.vibrate(FEEL.nibbleVibrateMs);
    }
    el.ring.hidden = !model.fight;
    el.fish.hidden = !model.fight;
    el.hold.hidden = !model.fight;
    if (!model.fight || !motionRun) return;
    // Draw the tick Core judges next: it steps first, then tests the rod tip.
    const next = { ...motionRun, phaseTick: motionRun.phaseTick + 1 };
    const path = fishPath(next, next.phaseTick);
    const fish = path.at(-1)!;
    const before = path.at(-2)!;
    const radius = ringRadius(next);
    const rod = ringCentre();
    // Colour the ring as Core judges: its hit test is a little wider than the drawing.
    const reach = radius + FISHING.motion.fight.toleranceUnits;
    const inside = (rod.x - fish.x) ** 2 + (rod.y - fish.y) ** 2 <= reach ** 2;
    // The player's ring follows the rod tip and must cover the fish; Core tests the
    // same distance. The overlay is the square 100×100 water plane; sizes are percent.
    el.ring.style.left = `${rod.x}%`;
    el.ring.style.top = `${rod.y}%`;
    el.ring.style.width = `${radius * 2}%`;
    el.ring.classList.toggle('inside', inside);
    // The outer edge reddens as the line tightens (spec 033).
    el.ring.style.setProperty('--tension', String(motionRun.tension));
    el.fish.style.left = `${fish.x}%`;
    el.fish.style.top = `${fish.y}%`;
    // The shadow faces right; it turns to where the fish swims.
    if (fish.x !== before.x)
      el.fish.classList.toggle('left', fish.x < before.x);
    el.fish.classList.toggle('warning', fish.warning);
    el.fish.classList.toggle('dashing', fish.dashing);
    const filled = motionRun.hold / motionBounds(motionRun).holdTarget;
    el.hold.value = Math.round(filled * 100);
    // The fish looks nearer as the hold fills (spec 033 F1).
    el.fish.style.setProperty('--near', String(Math.min(1, filled)));
  }

  return {
    point,
    ringCentre,
    apply,
    /** The player's choice in the settings, remembered; motion asks inside this tap. */
    choose(preference: Preference) {
      choose(preference);
      if (preference === 'motion') void request();
    },
  };
}

/**
 * Whether this event is inside a user gesture: a request outside one would be refused,
 * and read as the player's refusal. The browser says where it can (Safari 16.4+,
 * Chromium); elsewhere only a click is sure to be one (a touch may end a scroll).
 */
function userActivated(event: Event) {
  const { userActivation } = navigator as {
    userActivation?: { isActive: boolean };
  };
  return userActivation?.isActive ?? event.type === 'click';
}

function readTuning(): RodTuning {
  return parseTuning(readJsonPref(TUNING_KEY)) ?? DEFAULT_TUNING;
}
function readPreference(): Preference {
  return readPref(PREFERENCE_KEY) === 'buttons' ? 'buttons' : 'motion';
}
function readGuide(): GuideStep | null {
  const stored = readPref(GUIDE_KEY);
  if (stored === 'done') return null;
  return GUIDE_STEPS.find((step) => step === stored) ?? 'aim';
}
