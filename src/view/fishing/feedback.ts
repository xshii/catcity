import './feedback.css';
import type { GameSession } from '../../application';
import { screenCue, soundCues, type ScreenCue } from './sound-cues';

/** How long a screen cue's class stays on the stage: the glow's length, past the shake's. */
const SCREEN_CUE_MS = 600;

/**
 * Best-effort device feedback. Never feeds timing or hardware results into Core. Where a
 * device cannot vibrate (iPhone), the stage answers instead (spec 033 F4); the same
 * setting switches either off.
 */
export function mountFishingFeedback(
  session: GameSession,
  stage: HTMLElement,
  button: HTMLButtonElement,
) {
  const canVibrate = typeof navigator.vibrate === 'function';
  let enabled = true;
  let previous = session.getSnapshot().fishing;
  let reset: number | undefined;
  let screenReset: number | undefined;
  const draw = () => {
    button.textContent = `${canVibrate ? '震动' : '画面反馈'}：${enabled ? '开' : '关'}`;
    button.setAttribute('aria-pressed', String(enabled));
  };
  const vibrate = (pattern: number | number[]) => {
    if (!canVibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      /* Optional hardware must not break play. */
    }
  };
  /** Plays a screen cue on the stage, restarting it if one is still showing. */
  const show = (cue: ScreenCue) => {
    stage.classList.remove('screen-shake', 'screen-glow');
    // Apply the removal first, so the same cue again restarts its animation.
    void stage.offsetWidth;
    stage.classList.add(`screen-${cue}`);
    window.clearTimeout(screenReset);
    screenReset = window.setTimeout(
      () => stage.classList.remove(`screen-${cue}`),
      SCREEN_CUE_MS,
    );
  };
  button.addEventListener('click', () => {
    enabled = !enabled;
    if (!enabled) vibrate(0);
    draw();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) vibrate(0);
  });
  session.subscribe(() => {
    const next = session.getSnapshot().fishing;
    const screen = screenCue(soundCues(previous, next), canVibrate);
    let cue: 'bite' | 'hook' | 'caught' | 'missed' | null = null;
    if (
      next.active?.id === previous.active?.id &&
      next.active?.phase !== previous.active?.phase
    ) {
      if (next.active?.phase === 'hook') cue = 'bite';
      if (next.active?.phase === 'fight') cue = 'hook';
    }
    if (
      next.lastResult?.runId === previous.active?.id &&
      !next.active &&
      next.lastResult?.runId !== previous.lastResult?.runId
    )
      cue = next.lastResult!.caught ? 'caught' : 'missed';
    previous = next;
    if (document.hidden) return;
    if (screen && enabled) show(screen);
    if (!cue) return;
    stage.dataset.feedback = cue;
    window.clearTimeout(reset);
    reset = window.setTimeout(() => {
      delete stage.dataset.feedback;
    }, 350);
    if (enabled)
      vibrate(
        { bite: [12, 35, 12], hook: 25, caught: [30, 45, 55], missed: 12 }[cue],
      );
  });
  draw();
  /** Extra cues (nibble, swing) that also respect the player's haptics setting. */
  return {
    pulse(pattern: number | number[]) {
      if (enabled && !document.hidden) vibrate(pattern);
    },
  };
}
