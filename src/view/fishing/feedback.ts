import type { GameSession } from '../../application';

/** Best-effort device feedback. Never feeds timing or hardware results into Core. */
export function mountFishingFeedback(session: GameSession, stage: HTMLElement) {
  const button = document.getElementById('haptics-toggle') as HTMLButtonElement;
  const supported = typeof navigator.vibrate === 'function';
  let enabled = supported;
  let previous = session.getSnapshot().fishing;
  let reset: number | undefined;
  const draw = () => {
    button.disabled = !supported;
    button.textContent = supported
      ? `震动：${enabled ? '开' : '关'}`
      : '此浏览器不支持震动';
    button.setAttribute('aria-pressed', String(enabled));
  };
  const vibrate = (pattern: number | number[]) => {
    if (!supported) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      /* Optional hardware must not break play. */
    }
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
    if (!cue || document.hidden) return;
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
}
