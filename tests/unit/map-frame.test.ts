import { expect, it } from 'vitest';
import {
  boardSize,
  MAP_VIEW,
  tileCenter,
} from '../../src/view/art/city-geometry';
import {
  frameMap,
  revealOffset,
  revealShift,
} from '../../src/view/city/geometry';

const ten = { width: 10, height: 10 };
const minScale = MAP_VIEW.minTilePx / MAP_VIEW.tile;

it('fits and centres the whole board when tiles stay readable', () => {
  const board = boardSize(ten);
  const frame = { width: 900, height: 800 };
  const { scale, center } = frameMap(frame, ten, false, { x: 0, y: 0 });
  expect(scale).toBeCloseTo(800 / board.height);
  expect(center).toEqual({ x: board.width / 2, y: board.height / 2 });
});

it('keeps phone overview tiles at the minimum and pans along the axis that does not fit', () => {
  const board = boardSize(ten);
  const frame = { width: 374, height: 620 };
  const { scale, center } = frameMap(frame, ten, false, { x: 0, y: 0 });
  expect(scale).toBe(minScale);
  expect(scale * MAP_VIEW.tile).toBe(MAP_VIEW.minTilePx);
  // Vertically the board fits and is centred; horizontally it is clamped to cover the frame.
  expect(center.y).toBe(board.height / 2);
  expect(center.x).toBeCloseTo(frame.width / scale / 2);
  const far = frameMap(frame, ten, false, { x: 1e6, y: 0 }).center.x;
  expect(far).toBeCloseTo(board.width - frame.width / scale / 2);
});

it('follows a cat at a larger scale without showing space beyond the board', () => {
  const frame = { width: 374, height: 620 };
  const cat = tileCenter(9, 0);
  const { scale, center } = frameMap(frame, ten, true, cat);
  expect(scale).toBeCloseTo(minScale * MAP_VIEW.followZoom);
  const board = boardSize(ten);
  expect(center.x + frame.width / scale / 2).toBeCloseTo(board.width);
  expect(center.y - frame.height / scale / 2).toBeCloseTo(0);
});

it('derives the frame from the map size, so larger maps still centre and pan', () => {
  const big = { width: 24, height: 18 };
  const board = boardSize(big);
  expect(board.width).toBe(24 * MAP_VIEW.tile + 2 * MAP_VIEW.padding);
  const desktop = frameMap({ width: 1200, height: 900 }, big, false, {
    x: 0,
    y: 0,
  });
  expect(desktop.scale).toBeCloseTo(
    Math.max(Math.min(1200 / board.width, 900 / board.height), minScale),
  );
  const middle = tileCenter(12, 9);
  const phone = frameMap({ width: 374, height: 620 }, big, false, middle);
  expect(phone.scale).toBe(minScale);
  expect(phone.center).toEqual(middle);
});

it('keeps the board between floating bars: centred in the band, clamped to its edges', () => {
  const board = boardSize(ten);
  const frame = { width: 390, height: 844 };
  const insets = { top: 100, bottom: 70 };
  // The board fits vertically: its middle sits in the middle of the open band.
  const fit = frameMap(frame, ten, false, { x: 0, y: 0 }, insets);
  const bandMiddle =
    insets.top + (frame.height - insets.top - insets.bottom) / 2;
  const boardMiddleOnScreen =
    frame.height / 2 + (board.height / 2 - fit.center.y) * fit.scale;
  expect(boardMiddleOnScreen).toBeCloseTo(bandMiddle);
  // Following a cat in the top row: the board's top edge stops at the top bar.
  const top = frameMap(frame, ten, true, tileCenter(0, 0), insets);
  const boardTopOnScreen = frame.height / 2 - top.center.y * top.scale;
  expect(boardTopOnScreen).toBeCloseTo(insets.top);
  const bottom = frameMap(frame, ten, true, tileCenter(9, 9), insets);
  const boardBottomOnScreen =
    frame.height / 2 + (board.height - bottom.center.y) * bottom.scale;
  expect(boardBottomOnScreen).toBeCloseTo(frame.height - insets.bottom);
});

it('moves the map only as far as it takes to show a covered tile, and never for a visible one', () => {
  const open = { top: 95, bottom: 673 };
  const gap = MAP_VIEW.revealGap;
  // Inside the open band, touching its edges or not: already visible.
  expect(revealOffset({ top: 300, bottom: 366 }, open)).toBe(0);
  expect(revealOffset({ top: 95, bottom: 673 }, open)).toBe(0);
  // Under the card: the map moves up until the tile is a small gap above the card.
  expect(revealOffset({ top: 640, bottom: 706 }, open)).toBe(706 - 673 + gap);
  // Under the hint: the map moves down until the tile is a small gap below it.
  expect(revealOffset({ top: 80, bottom: 146 }, open)).toBe(80 - 95 - gap);
});

it('keeps the camera still when the action card opens, unless the selected tile is under it', () => {
  const frame = { width: 390, height: 844 };
  // The camera frames between the scene bar and the tool bar only…
  const bars = { top: 52, bottom: 62 };
  // …while the hint and the action card float over the map too.
  const hint = { top: 95, bottom: 62 };
  const card = { top: 95, bottom: 171 };
  const camera = frameMap(frame, ten, true, tileCenter(7, 3), bars);
  const onScreen = (y: number, center = camera.center) =>
    frame.height / 2 + (y - center.y) * camera.scale;
  // A tile in the middle: the card opens beside it and nothing moves.
  expect(revealShift(frame, camera, tileCenter(6, 5), bars, hint)).toBe(0);
  expect(revealShift(frame, camera, tileCenter(6, 5), bars, card)).toBe(0);
  // A bottom-row tile under the card: the camera moves just far enough to show it.
  const low = tileCenter(7, 9);
  const half = (MAP_VIEW.tile * camera.scale) / 2;
  expect(onScreen(low.y) + half).toBeGreaterThan(frame.height - card.bottom);
  const shift = revealShift(frame, camera, low, bars, card);
  const moved = { x: camera.center.x, y: camera.center.y + shift };
  expect(onScreen(low.y, moved) + half).toBeCloseTo(
    frame.height - card.bottom - MAP_VIEW.revealGap,
  );
  // The card closes: the tile shows, so the camera stays where it is.
  expect(
    revealShift(frame, { ...camera, center: moved }, low, bars, hint),
  ).toBe(0);
  // On a short phone the bottom row lies off the screen, not under the card: no move.
  const short = { width: 360, height: 640 };
  const followTop = frameMap(short, ten, true, tileCenter(7, 3), bars);
  expect(revealShift(short, followTop, low, bars, card)).toBe(0);
});
