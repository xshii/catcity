import type { Place } from '../shell/place';

export type Capability = 'unknown' | 'ready' | 'denied' | 'unsupported';
export type Preference = 'motion' | 'buttons';
/** The first motion cast, taught one step at a time, in this order (spec 033 F3). */
export const GUIDE_STEPS = ['aim', 'power', 'cast', 'strike', 'fight'] as const;
export type GuideStep = (typeof GUIDE_STEPS)[number];

/**
 * Everything the fishing screen decides from, besides the world snapshot (spec 015).
 * View-local: never part of the world or a save. Continuous sensor readings (tilt,
 * power, the rod tip) stay in the motion module; this holds the states that switch
 * controls on and off.
 */
export interface FishingView {
  place: Place;
  toolsOpen: boolean;
  pageHidden: boolean;
  /** Fishing input waits for the player; opening anything pauses it. */
  paused: boolean;
  /** The button flow's rod button is held. */
  pressed: boolean;
  /** The run last seen; a new run starts paused. */
  runId: string | null;
  motion: {
    preference: Preference;
    capability: Capability;
    /** Environment facts, fixed at mount. */
    needsPermission: boolean;
    coarsePointer: boolean;
    calibrating: boolean;
    notice: string | null;
    /** The first-cast guide's step to learn next; null once done or skipped. Per device. */
    guide: GuideStep | null;
    /** This device never calibrated: the first time it can aim, calibration starts by itself. */
    autoCalibrate: boolean;
  };
}

export type FishingViewEvent =
  | { type: 'place'; place: Place }
  | { type: 'tools'; open: boolean }
  | { type: 'page'; hidden: boolean }
  | { type: 'run'; runId: string | null }
  | { type: 'hold'; pressed: boolean; buttonRun: boolean }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'toggle-pause' }
  | { type: 'preference'; preference: Preference }
  | { type: 'capability'; capability: Capability }
  /** Permission granted again: a refusal is forgotten, a ready sensor stays ready. */
  | { type: 'grant' }
  | { type: 'calibrating'; on: boolean }
  | { type: 'notice'; text: string | null }
  /** The player did a guide step's move; only the step being taught moves on. */
  | { type: 'guide'; did: GuideStep }
  | { type: 'skip-guide' };

export function initialFishingView(
  options: Pick<
    FishingView['motion'],
    | 'preference'
    | 'needsPermission'
    | 'coarsePointer'
    | 'guide'
    | 'autoCalibrate'
  >,
): FishingView {
  return {
    place: 'city',
    toolsOpen: false,
    pageHidden: false,
    paused: true,
    pressed: false,
    runId: null,
    motion: {
      preference: options.preference,
      capability: 'unknown',
      needsPermission: options.needsPermission,
      coarsePointer: options.coarsePointer,
      calibrating: false,
      notice: null,
      guide: options.guide,
      autoCalibrate: options.autoCalibrate,
    },
  };
}

/** The river is on screen, no tools cover it and the page is in front. */
export const canPlay = (view: FishingView) =>
  view.place === 'river' && !view.toolsOpen && !view.pageHidden;
export const motionActive = (view: FishingView) =>
  view.motion.preference === 'motion' && view.motion.capability === 'ready';

/**
 * Pure transitions. Invariants (unit-tested under random event sequences): outside play
 * input is paused and released; a held button implies play; calibration only runs while
 * motion is active and playable, before a run, and starts by itself at most once; the
 * guide only moves forward, one step per move, and only in motion play.
 */
export function reduceFishingView(
  view: FishingView,
  event: FishingViewEvent,
): FishingView {
  const next = step(view, event);
  if (!canPlay(next) || next.runId !== view.runId)
    return settle({ ...next, paused: true, pressed: false }, view);
  return settle(next, view);
}

function step(view: FishingView, event: FishingViewEvent): FishingView {
  const motion = (changes: Partial<FishingView['motion']>) => ({
    ...view,
    motion: { ...view.motion, ...changes },
  });
  switch (event.type) {
    case 'place':
      return { ...view, place: event.place };
    case 'tools':
      return { ...view, toolsOpen: event.open };
    case 'page':
      return { ...view, pageHidden: event.hidden };
    case 'run':
      return { ...view, runId: event.runId };
    case 'hold':
      return event.pressed && event.buttonRun && canPlay(view)
        ? { ...view, pressed: true, paused: false }
        : { ...view, pressed: false };
    case 'pause':
      return { ...view, paused: true, pressed: false };
    case 'resume':
      return { ...view, paused: false };
    case 'toggle-pause':
      return { ...view, paused: !view.paused, pressed: false };
    case 'preference':
      return motion({ preference: event.preference });
    case 'capability':
      return motion({ capability: event.capability });
    case 'grant':
      return view.motion.capability === 'denied'
        ? motion({ capability: 'unknown' })
        : view;
    case 'calibrating':
      return motion({ calibrating: event.on });
    case 'notice':
      return motion({ notice: event.text });
    case 'guide':
      return event.did === view.motion.guide && motionActive(view)
        ? motion({
            guide: GUIDE_STEPS[GUIDE_STEPS.indexOf(event.did) + 1] ?? null,
          })
        : view;
    case 'skip-guide':
      return motion({ guide: null });
  }
}

/**
 * Calibration needs play, motion and no run; a device never calibrated starts it the
 * first time that holds. Unchanged states keep their identity.
 */
function settle(next: FishingView, previous: FishingView): FishingView {
  const aiming = canPlay(next) && motionActive(next) && next.runId === null;
  const auto = next.motion.autoCalibrate && aiming;
  const calibrating = aiming && (next.motion.calibrating || auto);
  const settled =
    calibrating === next.motion.calibrating && !auto
      ? next
      : {
          ...next,
          motion: {
            ...next.motion,
            calibrating,
            autoCalibrate: next.motion.autoCalibrate && !auto,
          },
        };
  return JSON.stringify(settled) === JSON.stringify(previous)
    ? previous
    : settled;
}

/** A tiny store: dispatch events, read the state, subscribe to changes. */
export function createFishingView(initial: FishingView) {
  let state = initial;
  const listeners = new Set<(view: FishingView) => void>();
  return {
    get: () => state,
    dispatch(event: FishingViewEvent) {
      const next = reduceFishingView(state, event);
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener(state);
    },
    subscribe(listener: (view: FishingView) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
export type FishingViewStore = ReturnType<typeof createFishingView>;
