/**
 * What floats over the city map (spec 031), one source for the scene and the harness. The
 * camera frames the board between the persistent `bars`: scene bar and tool bar. The
 * next-step hint and the action card float over the map without moving it, so `covers`,
 * which real clicks and a revealed selection keep clear of, is all of them.
 */
export const BAR_SELECTORS = {
  bars: { top: '#map-heading', bottom: '#city-tools-nav' },
  covers: {
    top: '#map-heading, .city-map-hint',
    bottom: '#city-tools-nav, #city-action-card',
  },
} as const;

interface Span {
  top: number;
  bottom: number;
}

/**
 * How far the given bars reach over the map frame, in CSS px. Pure, so the scene and the
 * harness's real clicks share it.
 */
export function barInsets(frame: Span, top: Span[], bottom: Span[]) {
  return {
    top: Math.max(0, ...top.map((bar) => bar.bottom - frame.top)),
    bottom: Math.max(0, ...bottom.map((bar) => frame.bottom - bar.top)),
  };
}

/** The insets now: of the bars the camera frames between, and of all that covers the map. */
export function measureBarInsets() {
  const frame = document.getElementById('game')!.getBoundingClientRect();
  const shown = (selector: string) =>
    Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter((element) => element.offsetParent !== null)
      .map((element) => element.getBoundingClientRect());
  const insets = (selectors: { top: string; bottom: string }) =>
    barInsets(frame, shown(selectors.top), shown(selectors.bottom));
  return {
    bars: insets(BAR_SELECTORS.bars),
    covers: insets(BAR_SELECTORS.covers),
  };
}
