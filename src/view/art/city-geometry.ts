/**
 * Map drawing in world pixels. `size` is also the river art's square and the canvas's
 * short side in logical pixels, so both scenes keep today's pixel density.
 */
export const MAP_VIEW = {
  size: 640,
  tile: 52,
  /** Board margin around the tiles, room for the bottom row's name labels. */
  padding: 16,
  /** Smallest overview tile on screen (CSS px); below it the overview pans instead. */
  minTilePx: 44,
  /** Following a cat magnifies the overview scale by this factor. */
  followZoom: 1.5,
  /** Pointer travel (CSS px) that turns a tap into a drag. */
  dragPx: 8,
  /** Room (CSS px) left between a revealed tile and the card or hint that covered it. */
  revealGap: 8,
} as const;

export interface Size {
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}

export function tileCenter(x: number, y: number): Point {
  return {
    x: MAP_VIEW.padding + (x + 0.5) * MAP_VIEW.tile,
    y: MAP_VIEW.padding + (y + 0.5) * MAP_VIEW.tile,
  };
}

/** The board in world pixels for a map of `tiles` columns × rows. */
export const boardSize = (tiles: Size): Size => ({
  width: tiles.width * MAP_VIEW.tile + 2 * MAP_VIEW.padding,
  height: tiles.height * MAP_VIEW.tile + 2 * MAP_VIEW.padding,
});
