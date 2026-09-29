import { CARE } from '../../src/content/care';
import { enterRiver } from '../../harness/adapters/catcity/city-input';
import { expect, test } from '@playwright/test';
import { FISHING } from '../../src/content/fishing';
import { WATER_VIEW, waterPoint } from '../../src/view/art/water-view';
import { castOnce } from '../../harness/adapters/catcity/angling-input';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import {
  closeRiverPanel,
  openCats,
  openGear,
} from '../../harness/adapters/catcity/navigation';

test('scene input aims at water, cat cards switch independent stamina, and idle cats recover on the city clock', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await ready(page);
  await enterRiver(page);
  const arrival = await readWorld(page);
  const canvas = page.locator('canvas');
  const bounds = (await canvas.boundingBox())!;
  // Tapping the far left of the water aims hard left.
  const left = waterPoint(-FISHING.input.maxDirection, 0.5);
  await canvas.click({
    position: {
      x: (bounds.width * left.x) / WATER_VIEW.size,
      y: (bounds.height * left.y) / WATER_VIEW.size,
    },
  });
  await expect(page.locator('#fish-direction')).toHaveValue(
    String(-FISHING.input.maxDirection),
  );
  await openGear(page);
  await page.locator('[data-bait="WORM"]').click();
  await expect(page.locator('#fish-bait')).toHaveValue('WORM');
  await closeRiverPanel(page);
  await page.locator('#cast-start').click();
  await expect(page.locator('#fishing-stage #fish-control')).toBeVisible();
  await castOnce(page);
  await page.locator('#fish-cancel').click();
  expect((await readWorld(page)).cats[0]!.needs.energy).toBe(
    arrival.cats[0]!.needs.energy - 8,
  );
  // Nothing to press: an idle, tired cat shows that it is recovering.
  await openCats(page);
  await expect(page.locator('[data-cat-id="mochi"] .sleep-mark')).toBeVisible();
  await page.locator('#invite-pepper').click();
  const pepper = (await readWorld(page)).cats[1]!;
  await page.locator(`[data-cat-id="${pepper.id}"]`).click();
  await closeRiverPanel(page);
  await enterRiver(page);
  const pepperArrival = await readWorld(page);
  await page.locator('#cast-start').click();
  await castOnce(page);
  await page.locator('#fish-cancel').click();
  const pepperEnergy = pepperArrival.cats[1]!.needs.energy - 8;
  expect((await readWorld(page)).cats[1]!.needs.energy).toBe(pepperEnergy);
  // The city clock (the browser's real-time adapter in play) recovers idle cats.
  await page.evaluate(() => window.CAT_CITY_DEBUG!.advanceTime(60));
  expect((await readWorld(page)).cats.map((cat) => cat.needs.energy)).toEqual([
    100,
    Math.min(100, pepperEnergy + 6 * CARE.recovery.idle),
  ]);
  expect((await readWorld(page)).minute).toBe(pepperArrival.minute + 60);
  const before = await readWorld(page);
  await page.reload();
  await ready(page);
  expect(await readWorld(page)).toEqual(before);
  await enterRiver(page);
  await page.screenshot({
    path: testInfo.outputPath('cat-recovery-scene.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
