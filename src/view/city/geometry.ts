import {
  boardSize,
  MAP_VIEW,
  type Point,
  type Size,
} from '../art/city-geometry';

/** A stretch down the map frame, in CSS px from its top. */
interface Span {
  top: number;
  bottom: number;
}
/** How far (CSS px) the floating bars reach over the frame's top and bottom edges. */
interface Insets {
  top: number;
  bottom: number;
}

/**
 * Where the city camera looks: `scale` is CSS px per world px and `center` a world point.
 * Overview fits the board unless tiles would drop below `minTilePx`; follow magnifies it.
 * On each axis the board is centred when it fits and otherwise clamped to cover the frame,
 * so it never drifts to one side, whatever the map or screen size. The scene bar and the
 * tool bar cover `insets` (CSS px) at the top and bottom: the board keeps to the band between
 * them. The hint and the action card float over the map and never enter the framing.
 */
export function frameMap(
  frame: Size,
  tiles: Size,
  follow: boolean,
  focus: Point,
  insets: Insets = { top: 0, bottom: 0 },
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

/**
 * How far to scroll the view (CSS px; positive looks further down, so the map moves up) for a
 * selected `tile` to show in the `open` band nothing covers: zero when it already does,
 * otherwise just far enough to leave `MAP_VIEW.revealGap` from the card or hint over it.
 */
export function revealOffset(tile: Span, open: Span): number {
  if (tile.top < open.top) return tile.top - open.top - MAP_VIEW.revealGap;
  if (tile.bottom > open.bottom)
    return tile.bottom - open.bottom + MAP_VIEW.revealGap;
  return 0;
}

/**
 * The camera shift (world px down) that reveals the selected tile at `at` from under the
 * action card or the hint. `bars` are the insets the camera frames between, `covers` those of
 * everything over the map now. A tile outside the band between the bars is off the screen,
 * not under the card, so the camera never moves for a card just opening over the map.
 */
export function revealShift(
  frame: Size,
  camera: { scale: number; center: Point },
  at: Point,
  bars: Insets,
  covers: Insets,
): number {
  const y = frame.height / 2 + (at.y - camera.center.y) * camera.scale;
  const half = (MAP_VIEW.tile * camera.scale) / 2;
  const tile = { top: y - half, bottom: y + half };
  if (tile.bottom <= bars.top || tile.top >= frame.height - bars.bottom)
    return 0;
  const open = { top: covers.top, bottom: frame.height - covers.bottom };
  return revealOffset(tile, open) / camera.scale;
}
