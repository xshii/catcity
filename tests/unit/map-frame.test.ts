import { expect, it } from 'vitest';
import {
  boardSize,
  frameMap,
  MAP_VIEW,
  tileCenter,
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
