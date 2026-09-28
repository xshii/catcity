import type { GameSession } from '../../application';
import { FISHING } from '../../content/fishing';
import type { PlaceState } from '../shell/place';
import { TIME_SCALE } from '../time-scale';

export interface FishingControlsDeps {
  session: GameSession;
  place: PlaceState;
  /** The hold-to-reel button of the frozen button flow. */
  control: HTMLButtonElement;
  castStart: HTMLButtonElement;
  toolsOpen: () => boolean;
  /** Motion rod tip on the 100×100 water plane; null before any reading. */
  rodTip: () => { x: number; y: number } | null;
  onCastStart: () => void;
  onChange: () => void;
}

/**
 * Real inputs of a run: the held button, pause, and the 20 Hz clock that turns them into
 * fishing commands. Leaving the page or the scene pauses and releases the hold.
 */
export function mountFishingControls(deps: FishingControlsDeps) {
  const { session, control, castStart } = deps;
  let pressed = false;
  let paused = true;
  let freshCastPress = false;
  let manualClock = false;

  const pause = () => {
    paused = true;
    pressed = false;
  };
  const down = () => {
    if (deps.toolsOpen()) return;
    if (session.getSnapshot().fishing.active?.mode === 'buttons') {
      paused = false;
      pressed = true;
      deps.onChange();
    }
  };
  const up = () => {
    pressed = false;
    deps.onChange();
  };
  const leave = () => {
    freshCastPress = false;
    paused = true;
    up();
  };

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
    down();
  });
  control.addEventListener('pointerup', up);
  control.addEventListener('pointercancel', () => {
    paused = true;
    up();
  });
  control.addEventListener('lostpointercapture', up);
  control.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      if (!event.repeat) down();
    }
  });
  control.addEventListener('keyup', (event) => {
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      up();
    }
  });
  window.addEventListener('blur', leave);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) leave();
  });

  /** Fishing ticks from the current real inputs; false when play is paused. */
  const tick = (scale: number): boolean => {
    const run = session.getSnapshot().fishing.active;
    if (
      !run ||
      paused ||
      document.hidden ||
      deps.place.get() !== 'river' ||
      deps.toolsOpen()
    )
      return false;
    // Only the bite wait is sped up; hook and fight need a timely player reaction.
    const ticks = run.phase === 'waiting' ? scale : 1;
    if (run.mode === 'motion') {
      if (run.phase === 'charge') return false;
      const point = deps.rodTip() ?? { x: 50, y: 50 };
      session.execute({
        type: 'FISH_MOTION_CONTROL',
        runId: run.id,
        ...point,
        ticks,
      });
    } else
      session.execute({ type: 'FISH_CONTROL', runId: run.id, pressed, ticks });
    return true;
  };
  // Browser time drives ticks; tests may take over the clock like ADVANCE_TIME.
  window.setInterval(() => {
    if (!manualClock) tick(TIME_SCALE);
  }, 1000 / FISHING.ticksPerSecond);

  return {
    paused: () => paused,
    pressed: () => pressed,
    pause,
    /** A successful motion cast starts the clock at once. */
    resume: () => {
      paused = false;
    },
    togglePause: () => {
      paused = !paused;
      pressed = false;
    },
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
