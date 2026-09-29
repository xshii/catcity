import { expect, test } from '@playwright/test';
import {
  clickTile,
  reachWaterway,
  settle,
} from '../../harness/adapters/catcity/city-input';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';

test('the first mobile map visibly places Mochi beside a pond that opens immediately', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await ready(page);
  const before = await readWorld(page);
  const cat = before.cats[0]!;
  const pond = before.map.tiles.find(
    (tile) =>
      tile.terrain === 'POND' &&
      Math.abs(tile.position.x - cat.position.x) +
        Math.abs(tile.position.y - cat.position.y) ===
        1,
  )!;
  expect(pond).toBeDefined();
  const rect = (await page.locator('canvas').boundingBox())!;
  for (const position of [cat.position, pond.position]) {
    const point = await page.evaluate(
      (tile) => window.CAT_CITY_DEBUG!.getTileScreenPosition(tile),
      position,
    );
    expect(point).not.toBeNull();
    expect(point!.x).toBeGreaterThan(rect.x);
    expect(point!.x).toBeLessThan(rect.x + rect.width);
    expect(point!.y).toBeGreaterThan(rect.y);
    expect(point!.y).toBeLessThan(rect.y + rect.height);
  }
  await page.screenshot({
    path: testInfo.outputPath('initial-pond-shore.png'),
  });
  await clickTile(page, pond.position.x, pond.position.y);
  await expect(page.locator('#begin-fishing')).toBeVisible();
  expect(await readWorld(page)).toEqual(before);
});

test('a new cat starts beside the pond and can enter fishing without travel or resource cost', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  const before = await readWorld(page);
  await expect(page.locator('#city-overview')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  const screen = await page.evaluate(
    (position) => window.CAT_CITY_DEBUG!.getTileScreenPosition(position),
    before.cats[0]!.position,
  );
  expect(screen).not.toBeNull();
  await page.mouse.click(screen!.x, screen!.y);
  await expect(page.locator('#city-selection-label')).toContainText('Mochi');
  await expect(page.locator('#city-action-detail')).toContainText('走到这里');
  // Selecting follows the cat: read its place once the camera has moved.
  await settle(page);
  const selectedScreen = await page.evaluate(
    (position) => window.CAT_CITY_DEBUG!.getTileScreenPosition(position),
    before.cats[0]!.position,
  );
  await page.mouse.click(selectedScreen!.x, selectedScreen!.y);
  await expect(page.locator('#city-action-card')).toBeHidden();
  expect(await readWorld(page)).toEqual(before);
  await page.locator('#visit-river').click();
  await expect(page.locator('#visit-river')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#cast-start')).toBeVisible();
  expect(await readWorld(page)).toEqual(before);
  await reachWaterway(page);
  const arrived = await readWorld(page);
  expect(arrived.minute).toBe(before.minute);
  expect(arrived.cats[0]!.position).toEqual(before.cats[0]!.position);
  expect(arrived.cats[0]!.needs.energy).toBe(100);
  expect(arrived.fishing.active).toBeNull();
  expect(arrived.fishing.baits).toEqual(before.fishing.baits);
  await page.locator('#begin-fishing').click();
  await expect(page.locator('#cast-start')).toBeVisible();
  expect(await readWorld(page)).toEqual(arrived);
  await page.locator('#cast-start').click();
  await expect(page.locator('#fish-control')).toBeVisible();
  // Preparing is free; stamina is paid when the cast is released.
  expect((await readWorld(page)).cats[0]!.needs.energy).toBe(
    arrived.cats[0]!.needs.energy,
  );
  // Leaving with the rod uncast gives it up at no cost; back at the shore, the player
  // prepares again (spec 002: the cat recovers instead of holding the rod).
  await page.locator('#visit-city').click();
  const left = await readWorld(page);
  expect(left.fishing.active).toBeNull();
  expect(left.cats[0]!.needs.energy).toBe(arrived.cats[0]!.needs.energy);
  expect(left.fishing.baits).toEqual(arrived.fishing.baits);
  await reachWaterway(page);
  await page.locator('#begin-fishing').click();
  await expect(page.locator('#cast-start')).toBeVisible();
  expect(
    await page.evaluate(() =>
      window
        .CAT_CITY_DEBUG!.getReplay()
        .entries.filter((entry) => entry.command.type === 'FISH_CANCEL'),
    ),
  ).toHaveLength(1);
});
