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
} as const;

interface Size {
  width: number;
  height: number;
}
interface Point {
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

/**
 * Where the city camera looks: `scale` is CSS px per world px and `center` a world point.
 * Overview fits the board unless tiles would drop below `minTilePx`; follow magnifies it.
 * On each axis the board is centred when it fits and otherwise clamped to cover the frame,
 * so it never drifts to one side, whatever the map or screen size.
 */
export function frameMap(
  frame: Size,
  tiles: Size,
  follow: boolean,
  focus: Point,
): { scale: number; center: Point } {
  const board = boardSize(tiles);
  const overview = Math.max(
    Math.min(frame.width / board.width, frame.height / board.height),
    MAP_VIEW.minTilePx / MAP_VIEW.tile,
  );
  const scale = follow ? overview * MAP_VIEW.followZoom : overview;
  const axis = (span: number, length: number, at: number) =>
    span >= length
      ? length / 2
      : Math.min(Math.max(at, span / 2), length - span / 2);
  return {
    scale,
    center: {
      x: axis(frame.width / scale, board.width, focus.x),
      y: axis(frame.height / scale, board.height, focus.y),
    },
  };
}
