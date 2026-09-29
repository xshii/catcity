import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  barInsetsOf,
  liftAndDrop,
  settle,
} from '../../harness/adapters/catcity/city-input';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import type { Position, WorldState } from '../../src/core';

// Spec 035: a long press lifts a cat; letting it go over a tile sends it there.

async function phone(browser: Browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${localOrigin(testPorts().test)}/`);
  await ready(page);
  // The overview pans under a dragging finger: the lift must not.
  await page.locator('#city-overview').tap();
  await expect(page.locator('#city-overview')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await settle(page);
  return { context, page, errors };
}

const onScreen = (page: Page, position: Position) =>
  page.evaluate(
    (tile) => window.CAT_CITY_DEBUG!.getTileScreenPosition(tile)!,
    position,
  );

/** The nearest tile to the cat, in another column, that shows clear of the bars and the hint. */
async function nearest(
  page: Page,
  world: WorldState,
  wanted: (tile: WorldState['map']['tiles'][number]) => boolean,
) {
  const cat = world.cats[0]!.position;
  const frame = (await page.locator('#game').boundingBox())!;
  const { covers } = await barInsetsOf(page, frame);
  const distance = (position: Position) =>
    Math.abs(position.x - cat.x) + Math.abs(position.y - cat.y);
  const tiles = world.map.tiles
    .filter((tile) => tile.position.x !== cat.x && wanted(tile))
    .sort((a, b) => distance(a.position) - distance(b.position));
  for (const tile of tiles) {
    const point = await onScreen(page, tile.position);
    if (
      point.x > frame.x + 30 &&
      point.x < frame.x + frame.width - 30 &&
      point.y > frame.y + covers.top + 30 &&
      point.y < frame.y + frame.height - covers.bottom - 30
    )
      return { position: tile.position, point };
  }
  throw new Error('No such tile shows on the screen');
}

test('a long press lifts a cat, and letting it go over a tile starts the walk without panning the map', async ({
  browser,
}, testInfo) => {
  const { context, page, errors } = await phone(browser);
  try {
    const before = await readWorld(page);
    const cat = before.cats[0]!;
    const free = (position: Position) =>
      !before.buildings.some(
        (building) =>
          building.position.x === position.x &&
          building.position.y === position.y,
      );
    const target = await nearest(
      page,
      before,
      (tile) =>
        tile.terrain === 'GRASS' &&
        free(tile.position) &&
        Math.abs(tile.position.x - cat.position.x) >= 2,
    );
    const from = await onScreen(page, cat.position);
    const canvas = page.locator('#game canvas');
    await liftAndDrop(page, from, target.point, async () => {
      await expect(canvas).toHaveAttribute('data-lifted', cat.id);
      await expect(canvas).toHaveAttribute('data-drop', 'walk');
      // The finger travelled across tiles; the map stayed where it was.
      const held = await onScreen(page, cat.position);
      expect(held.x).toBeCloseTo(from.x, 1);
      expect(held.y).toBeCloseTo(from.y, 1);
      // Lifting is only a view: nothing in the world has changed yet.
      expect(await readWorld(page)).toEqual(before);
      await page.screenshot({ path: testInfo.outputPath('lifted-valid.png') });
    });
    await expect(canvas).not.toHaveAttribute('data-lifted', /./);
    const after = await readWorld(page);
    expect(after.cats[0]!.walk?.destination).toEqual(target.position);
    // The cat walks its route: it has not jumped to the tile.
    expect(after.cats[0]!.position).toEqual(cat.position);
    await expect(page.locator('#notice')).toContainText(`${cat.name} 出发了`);
    const { entries } = await page.evaluate(() =>
      window.CAT_CITY_DEBUG!.getReplay(),
    );
    expect(entries.at(-1)!.command).toEqual({
      type: 'WALK_CAT',
      catId: cat.id,
      destination: target.position,
    });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('letting a lifted cat go where it cannot be sent changes nothing; a quick drag from a cat still pans', async ({
  browser,
}, testInfo) => {
  const { context, page, errors } = await phone(browser);
  try {
    const before = await readWorld(page);
    const cat = before.cats[0]!;
    // Water the cat cannot be sent to: its own shore's, or a spot still locked.
    const water = await nearest(
      page,
      before,
      (tile) => tile.terrain !== 'GRASS',
    );
    const from = await onScreen(page, cat.position);
    const canvas = page.locator('#game canvas');
    const notice = await page.locator('#notice').textContent();
    await liftAndDrop(page, from, water.point, async () => {
      await expect(canvas).toHaveAttribute('data-drop', 'none');
      const held = await onScreen(page, cat.position);
      expect(held.x).toBeCloseTo(from.x, 1);
      expect(held.y).toBeCloseTo(from.y, 1);
      await page.screenshot({
        path: testInfo.outputPath('lifted-invalid.png'),
      });
    });
    await expect(canvas).not.toHaveAttribute('data-lifted', /./);
    await settle(page);
    expect(await readWorld(page)).toEqual(before);
    await expect(page.locator('#city-action-card')).toBeHidden();
    expect(await page.locator('#notice').textContent()).toBe(notice);
    const replay = await page.evaluate(() =>
      window.CAT_CITY_DEBUG!.getReplay(),
    );
    expect(replay.entries).toEqual([]);

    // The same finger moving at once, from the cat: the map pans as before.
    const touch = await context.newCDPSession(page);
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number) =>
      touch.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: x === undefined ? [] : [{ x, y: from.y }],
      });
    await send('touchStart', from.x);
    for (const dx of [-20, -40, -60]) await send('touchMove', from.x + dx);
    await send('touchEnd');
    await settle(page);
    const panned = await onScreen(page, cat.position);
    expect(panned.x).toBeLessThan(from.x - 10);
    await expect(canvas).not.toHaveAttribute('data-lifted', /./);
    await expect(page.locator('#city-action-card')).toBeHidden();
    expect(await readWorld(page)).toEqual(before);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
