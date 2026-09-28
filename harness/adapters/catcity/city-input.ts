import { expect, type Page } from '@playwright/test';
import type { SpotId } from '../../../src/content/fish';
import { shoreTiles, samePosition, spotAt } from '../../../src/core/city';
import type { WorldState } from '../../../src/core';
import { MAP_VIEW, tileCenter } from '../../../src/view/city/geometry';

/** Read-only observation works in test and in a production build without its bridge. */
async function observeWorld(page: Page): Promise<WorldState> {
  return page.evaluate(() => {
    if (window.CAT_CITY_DEBUG) return window.CAT_CITY_DEBUG.getWorldState();
    const save = localStorage.getItem('cat-city.save.v1');
    if (!save) throw new Error('No saved world to observe');
    return JSON.parse(save).world as WorldState;
  });
}

export async function clickTile(page: Page, x: number, y: number) {
  const close = page.locator('#river-tools-close');
  if (await close.isVisible()) await close.click();
  const overview = page.locator('#city-overview');
  if ((await overview.getAttribute('aria-pressed')) !== 'true')
    await overview.click();
  const canvas = page.locator('canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Canvas must have bounds');
  const center = tileCenter(x, y);
  await canvas.click({
    position: {
      x: (center.x * bounds.width) / MAP_VIEW.size,
      y: (center.y * bounds.height) / MAP_VIEW.size,
    },
  });
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
