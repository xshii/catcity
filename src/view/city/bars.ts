/** The floating bars over the city map (spec 031): scene bar and hint, tool bar and card. */
export const BAR_SELECTORS = {
  top: '#map-heading, .city-map-hint',
  bottom: '#city-tools-nav, #city-action-card',
} as const;

interface Span {
  top: number;
  bottom: number;
}

/**
 * How far the bars reach over the map frame, in CSS px; the camera keeps the board
 * between them. Pure, so the scene and the harness's real clicks share it.
 */
export function barInsets(frame: Span, top: Span[], bottom: Span[]) {
  return {
    top: Math.max(0, ...top.map((bar) => bar.bottom - frame.top)),
    bottom: Math.max(0, ...bottom.map((bar) => frame.bottom - bar.top)),
  };
}

/** The insets of the bars shown now. */
export function measureBarInsets() {
  const shown = (selector: string) =>
    Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter((element) => element.offsetParent !== null)
      .map((element) => element.getBoundingClientRect());
  return barInsets(
    document.getElementById('game')!.getBoundingClientRect(),
    shown(BAR_SELECTORS.top),
    shown(BAR_SELECTORS.bottom),
  );
}
