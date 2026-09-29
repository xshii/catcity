/**
 * How far the floating bars reach over the city map frame (#game), in CSS px (spec 031):
 * the scene bar and the next-step hint at the top, the tool bar and an open action card
 * at the bottom. The camera keeps the board between them.
 *
 * Self-contained on purpose: the harness passes this very function to `page.evaluate`, so
 * real clicks aim with the same insets the scene frames with, even in production builds.
 */
export function measureBarInsets(): { top: number; bottom: number } {
  const game = document.getElementById('game')!.getBoundingClientRect();
  const covered = (selector: string) =>
    Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter((element) => element.offsetParent !== null)
      .map((element) => element.getBoundingClientRect());
  const top = covered('#map-heading, .city-map-hint');
  const bottom = covered('#city-tools-nav, #city-action-card');
  return {
    top: Math.max(0, ...top.map((box) => box.bottom - game.top)),
    bottom: Math.max(0, ...bottom.map((box) => game.bottom - box.top)),
  };
}
