import type { GameSession } from '../../application';
import { FISHING } from '../../content/fishing';
import { TIME_SCALE } from '../time-scale';
import { canPlay, type FishingViewStore } from './view-state';

export interface FishingControlsDeps {
  session: GameSession;
  view: FishingViewStore;
  /** The hold-to-reel button of the frozen button flow. */
  control: HTMLButtonElement;
  castStart: HTMLButtonElement;
  /** Motion rod tip on the 100×100 water plane; null before any reading. */
  rodTip: () => { x: number; y: number } | null;
  onCastStart: () => void;
}

/**
 * Real inputs of a run: the held button, pause, and the 20 Hz clock that turns them into
 * fishing commands. Pause and hold live in the fishing view state, whose rules release
 * them whenever play stops; this module only reports inputs and ticks.
 */
export function mountFishingControls(deps: FishingControlsDeps) {
  const { session, view, control, castStart } = deps;
  let freshCastPress = false;
  let manualClock = false;
  const buttonRun = () =>
    session.getSnapshot().fishing.active?.mode === 'buttons';
  const hold = (pressed: boolean) =>
    view.dispatch({ type: 'hold', pressed, buttonRun: buttonRun() });

  document.addEventListener('pointerdown', (event) => {
    freshCastPress =
      event.target instanceof Node && castStart.contains(event.target);
  });
  document.addEventListener('pointercancel', () => {
    freshCastPress = false;
  });
  castStart.addEventListener('click', (event) => {
    // A landing can hide the held reel button before touchend. Its synthesized
    // click must not activate the newly revealed cast button underneath it.
    const intentional = event.detail === 0 || freshCastPress;
    freshCastPress = false;
    if (intentional) deps.onCastStart();
  });
  // Holding the rod button must not open the long-press context menu.
  control.addEventListener('contextmenu', (event) => event.preventDefault());
  control.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    control.focus({ preventScroll: true });
    control.setPointerCapture(event.pointerId);
    hold(true);
  });
  control.addEventListener('pointerup', () => hold(false));
  control.addEventListener('pointercancel', () =>
    view.dispatch({ type: 'pause' }),
  );
  control.addEventListener('lostpointercapture', () => hold(false));
  control.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      if (!event.repeat) hold(true);
    }
  });
  control.addEventListener('keyup', (event) => {
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      hold(false);
    }
  });
  window.addEventListener('blur', () => {
    freshCastPress = false;
    view.dispatch({ type: 'pause' });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) freshCastPress = false;
    view.dispatch({ type: 'page', hidden: document.hidden });
  });

  /** Fishing ticks from the current real inputs; false when play is paused. */
  const tick = (scale: number): boolean => {
    const run = session.getSnapshot().fishing.active;
    const state = view.get();
    if (!run || state.paused || !canPlay(state)) return false;
    // Only the bite wait is sped up; hook and fight need a timely player reaction.
    const ticks = run.phase === 'waiting' ? scale : 1;
    if (run.mode === 'motion') {
      if (run.phase === 'charge') return false;
      const point = deps.rodTip() ?? FISHING.motion.planeCentre;
      session.execute({
        type: 'FISH_MOTION_CONTROL',
        runId: run.id,
        ...point,
        ticks,
      });
    } else
      session.execute({
        type: 'FISH_CONTROL',
        runId: run.id,
        pressed: state.pressed,
        ticks,
      });
    return true;
  };
  // Browser time drives ticks; tests may take over the clock like ADVANCE_TIME.
  window.setInterval(() => {
    if (!manualClock) tick(TIME_SCALE);
  }, 1000 / FISHING.ticksPerSecond);

  return {
    clock: {
      setManual: (manual: boolean) => {
        manualClock = manual;
      },
      /** Runs the same tick as the interval; returns how many ticks applied. */
      step: (ticks: number) => {
        let applied = 0;
        for (let i = 0; i < ticks; i++) if (tick(1)) applied++;
        return applied;
      },
    },
  };
}
