import { expect, type Page } from '@playwright/test';
import type { SpotId } from '../../../src/content/fishing';
import { shoreTiles, samePosition, spotAt } from '../../../src/core/city';
import type { WorldState } from '../../../src/core';
import {
  boardSize,
  frameMap,
  MAP_VIEW,
  tileCenter,
} from '../../../src/view/city/geometry';
import { measureBarInsets } from '../../../src/view/city/bars';

/** Read-only observation works in test and in a production build without its bridge. */
async function observeWorld(page: Page): Promise<WorldState> {
  // A production page saves on its first clock tick; wait for something to observe.
  await page.waitForFunction(
    () =>
      window.CAT_CITY_DEBUG !== undefined ||
      localStorage.getItem('cat-city.save.v1') !== null,
  );
  return page.evaluate(() => {
    if (window.CAT_CITY_DEBUG) return window.CAT_CITY_DEBUG.getWorldState();
    const save = localStorage.getItem('cat-city.save.v1');
    if (!save) throw new Error('No saved world to observe');
    return JSON.parse(save).world as WorldState;
  });
}

const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

/**
 * Click a tile the way a player would: open a fresh overview (centred on the board), and
 * drag the map first when the tile lies outside the open band between the floating bars.
 * Positions come from the same framing rule and bar insets the scene uses, so this works
 * in production builds without the bridge.
 */
export async function clickTile(page: Page, x: number, y: number) {
  const close = page.locator('#river-tools-close');
  if (await close.isVisible()) await close.click();
  const overview = page.locator('#city-overview');
  if ((await overview.getAttribute('aria-pressed')) === 'true')
    await overview.click();
  await overview.click();
  // Scene switches and camera changes apply on the next rendered frames; read
  // the canvas only after they settle, or a busy machine clicks a stale layout.
  await settle(page);
  const { map } = await observeWorld(page);
  const bounds = await page.locator('#game').boundingBox();
  if (!bounds) throw new Error('Map frame must have bounds');
  const insets = await page.evaluate(measureBarInsets);
  const band = {
    top: insets.top,
    bottom: bounds.height - insets.bottom,
    middle: insets.top + (bounds.height - insets.top - insets.bottom) / 2,
  };
  const board = boardSize(map);
  let focus = { x: board.width / 2, y: board.height / 2 };
  const tile = tileCenter(x, y);
  for (let attempt = 0; attempt < 6; attempt++) {
    const framed = frameMap(bounds, map, false, focus, insets);
    const { scale, center } = framed;
    const point = {
      x: bounds.width / 2 + (tile.x - center.x) * scale,
      y: bounds.height / 2 + (tile.y - center.y) * scale,
    };
    const margin = (MAP_VIEW.tile * scale) / 2;
    if (
      point.x >= margin &&
      point.x <= bounds.width - margin &&
      point.y >= band.top + margin &&
      point.y <= band.bottom - margin
    ) {
      await page.mouse.click(bounds.x + point.x, bounds.y + point.y);
      return;
    }
    // Drag within the band towards the tile; the scene clamps the pan to the board.
    const reach = (value: number, middle: number, half: number) =>
      Math.max(margin - half, Math.min(half - margin, middle - value));
    const shift = {
      x: reach(point.x, bounds.width / 2, bounds.width / 2),
      y: reach(point.y, band.middle, (band.bottom - band.top) / 2),
    };
    const start = { x: bounds.x + bounds.width / 2, y: bounds.y + band.middle };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + shift.x, start.y + shift.y, { steps: 6 });
    await page.mouse.up();
    focus = frameMap(
      bounds,
      map,
      false,
      {
        x: framed.focus.x - shift.x / scale,
        y: framed.focus.y - shift.y / scale,
      },
      insets,
    ).focus;
    await settle(page);
  }
  throw new Error(`Tile ${x},${y} never came into view`);
}

/** All movement and elapsed time use visible player controls, including production smoke. */
export async function reachWaterway(page: Page, spotId: SpotId = 'POND') {
  const close = page.locator('#river-tools-close');
  if (await close.isVisible()) await close.click();
  await page.locator('#visit-city').click();
  const initial = await observeWorld(page);
  const water = initial.map.tiles.find(
    (tile) => spotAt(initial.map, tile.position) === spotId,
  );
  if (!water) throw new Error(`Missing waterway ${spotId}`);
  await clickTile(page, water.position.x, water.position.y);
  const travel = page.locator('#walk-to-waterway');
  if ((await travel.isVisible()) && (await travel.isEnabled()))
    await travel.click();
  for (
    let tick = 0;
    tick < 40 && !(await page.locator('#begin-fishing').isVisible());
    tick++
  ) {
    await expect(page.locator('#city-wait')).toBeVisible();
    await page.locator('#city-wait').click();
  }
  await expect(page.locator('#begin-fishing')).toBeVisible();
  const world = await observeWorld(page);
  const catId = await page.evaluate(
    () => window.CAT_CITY_DEBUG?.getSelectedEntity() ?? null,
  );
  const cat = world.cats.find((item) => item.id === catId) ?? world.cats[0]!;
  expect(cat.walk).toBeNull();
  expect(cat.fishingSpotId).toBe(spotId);
  expect(
    shoreTiles(world.map, spotId).some((position) =>
      samePosition(position, cat.position),
    ),
  ).toBe(true);
}

export async function enterRiver(page: Page, spotId?: SpotId) {
  if (
    (await page.locator('#visit-river').getAttribute('aria-pressed')) === 'true'
  )
    return;
  const world = await observeWorld(page);
  if (!world.fishing.active) {
    const selected =
      (spotId ??
        ((await page.locator('#fish-location').inputValue()) as SpotId)) ||
      'POND';
    await reachWaterway(page, selected);
  }
  await page.locator('#visit-river').click();
  await expect(page.locator('#visit-river')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}
