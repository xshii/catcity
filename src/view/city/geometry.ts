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
 * so it never drifts to one side, whatever the map or screen size. Floating bars cover
 * `insets` (CSS px) at the top and bottom: the board keeps to the open band between them,
 * so no row is ever stuck under a bar.
 */
export function frameMap(
  frame: Size,
  tiles: Size,
  follow: boolean,
  focus: Point,
  insets: { top: number; bottom: number } = { top: 0, bottom: 0 },
): { scale: number; focus: Point; center: Point } {
  const board = boardSize(tiles);
  const band = {
    width: frame.width,
    height: Math.max(1, frame.height - insets.top - insets.bottom),
  };
  const overview = Math.max(
    Math.min(band.width / board.width, band.height / board.height),
    MAP_VIEW.minTilePx / MAP_VIEW.tile,
  );
  const scale = follow ? overview * MAP_VIEW.followZoom : overview;
  const axis = (span: number, length: number, at: number) =>
    span >= length
      ? length / 2
      : Math.min(Math.max(at, span / 2), length - span / 2);
  // `focus` is the clamped point in the band's middle (what panning keeps); the camera
  // centres the whole frame, so it shifts by half the difference of the insets.
  const clamped = {
    x: axis(band.width / scale, board.width, focus.x),
    y: axis(band.height / scale, board.height, focus.y),
  };
  return {
    scale,
    focus: clamped,
    center: {
      x: clamped.x,
      y: clamped.y - (insets.top - insets.bottom) / 2 / scale,
    },
  };
}
