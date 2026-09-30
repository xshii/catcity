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
  /** The river's settings sheet (spec 034); like the tools, it covers play. */
  settingsOpen: boolean;
  pageHidden: boolean;
  /** Fishing input waits for the player; opening anything pauses it. */
  paused: boolean;
  /** The button flow's rod button is held. */
  pressed: boolean;
  /** The run last seen; a new run starts paused. */
  runId: string | null;
  /**
   * The last run this page saw on the river; its result is "this catch" until the player
   * leaves, or until a notice is raised over its card.
   */
  watched: string | null;
  motion: {
    preference: Preference;
    capability: Capability;
    /** Environment facts, fixed at mount. */
    needsPermission: boolean;
    coarsePointer: boolean;
    /** Sensor access was requested on this page: a gesture asks by itself only once. */
    asked: boolean;
    /** Refusals of sensor access on this page: a retry refused again is a new one. */
    refusals: number;
    calibrating: boolean;
    notice: string | null;
    /** The first-cast guide's step to learn next; null once done or skipped. Per device. */
    guide: GuideStep | null;
    /**
     * This device never calibrated: whenever it can aim, calibration starts by itself,
     * until one finishes.
     */
    autoCalibrate: boolean;
  };
}

export type FishingViewEvent =
  | { type: 'place'; place: Place }
  | { type: 'tools'; open: boolean }
  | { type: 'settings'; open: boolean }
  | { type: 'page'; hidden: boolean }
  | { type: 'run'; runId: string | null }
  | { type: 'hold'; pressed: boolean; buttonRun: boolean }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'toggle-pause' }
  | { type: 'preference'; preference: Preference }
  | { type: 'capability'; capability: Capability }
  /** Sensor access was just requested, inside the player's tap. */
  | { type: 'ask' }
  /** Permission granted again: a refusal is forgotten, a ready sensor stays ready. */
  | { type: 'grant' }
  /** Starting calibration (from the settings sheet) closes the sheet. */
  | { type: 'calibrating'; on: boolean }
  | { type: 'notice'; text: string | null }
  /** The notice bar was given a message, by anything on the page. */
  | { type: 'said' }
  /** The catch card was tapped, or its time ran out (R-02). */
  | { type: 'dismissed' }
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
    settingsOpen: false,
    pageHidden: false,
    paused: true,
    pressed: false,
    runId: null,
    watched: null,
    motion: {
      preference: options.preference,
      capability: 'unknown',
      needsPermission: options.needsPermission,
      coarsePointer: options.coarsePointer,
      asked: false,
      refusals: 0,
      calibrating: false,
      notice: null,
      guide: options.guide,
      autoCalibrate: options.autoCalibrate,
    },
  };
}

/** The river is on screen, no tools or settings cover it and the page is in front. */
export const canPlay = (view: FishingView) =>
  view.place === 'river' &&
  !view.toolsOpen &&
  !view.settingsOpen &&
  !view.pageHidden;
export const motionActive = (view: FishingView) =>
  view.motion.preference === 'motion' && view.motion.capability === 'ready';

/**
 * Pure transitions. Invariants (unit-tested under random event sequences): outside play
 * input is paused and released; a held button implies play; the settings sheet is only
 * open on the river with no tools over it; calibration only runs while motion is active
 * and playable, before a run, and starts by itself only until one finishes; the guide
 * only moves forward, one step per move, and only in motion play.
 */
export function reduceFishingView(
  view: FishingView,
  event: FishingViewEvent,
): FishingView {
  const stepped = step(view, event);
  const next =
    stepped.settingsOpen && (stepped.place !== 'river' || stepped.toolsOpen)
      ? { ...stepped, settingsOpen: false }
      : stepped;
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
      return {
        ...view,
        place: event.place,
        watched: event.place === 'river' ? view.watched : null,
      };
    case 'tools':
      return { ...view, toolsOpen: event.open };
    case 'settings':
      return { ...view, settingsOpen: event.open };
    case 'page':
      return { ...view, pageHidden: event.hidden };
    case 'run':
      return {
        ...view,
        runId: event.runId,
        watched: event.runId ?? view.watched,
      };
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
      return motion({
        capability: event.capability,
        refusals:
          view.motion.refusals + (event.capability === 'denied' ? 1 : 0),
      });
    case 'ask':
      return motion({ asked: true });
    case 'grant':
      return view.motion.capability === 'denied'
        ? motion({ capability: 'unknown' })
        : view;
    case 'calibrating':
      return event.on
        ? { ...motion({ calibrating: true }), settingsOpen: false }
        : motion({
            calibrating: false,
            // A calibration that ran to its end, whatever it found.
            autoCalibrate:
              view.motion.autoCalibrate && !view.motion.calibrating,
          });
    case 'notice':
      return motion({ notice: event.text });
    case 'said':
    case 'dismissed':
      // The catch card gives way to a newer notice, a tap or its time; in a run there is
      // no card, so a run's own notices change nothing.
      return view.runId === null && view.watched
        ? { ...view, watched: null }
        : view;
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
 * Calibration needs play, motion and no run; a device never calibrated starts it
 * whenever that holds, so one cut short (by the settings, say) starts again. Unchanged
 * states keep their identity.
 */
function settle(next: FishingView, previous: FishingView): FishingView {
  const aiming = canPlay(next) && motionActive(next) && next.runId === null;
  const calibrating =
    aiming && (next.motion.calibrating || next.motion.autoCalibrate);
  const settled =
    calibrating === next.motion.calibrating
      ? next
      : { ...next, motion: { ...next.motion, calibrating } };
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
