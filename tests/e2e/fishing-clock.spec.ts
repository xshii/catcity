import { expect, test } from '@playwright/test';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import { enterRiver } from '../../harness/adapters/catcity/city-input';
import { closeRiverPanel } from '../../harness/adapters/catcity/navigation';

test('a manual fishing clock advances exactly the stepped ticks and respects pause', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  await enterRiver(page);
  await closeRiverPanel(page);
  await page.evaluate(() => window.CAT_CITY_DEBUG!.useManualFishingClock(true));
  await page.locator('#cast-start').click();
  // A new run waits for the player's first press before any tick runs.
  expect(await page.evaluate(() => window.CAT_CITY_DEBUG!.stepFishing(5))).toBe(
    0,
  );
  await page.locator('#fish-control').focus();
  await page.keyboard.down('Space');
  const start = (await readWorld(page)).fishing.active!;
  // Real time passes, but no fishing tick runs without a step.
  await page.waitForTimeout(300);
  expect((await readWorld(page)).fishing.active).toEqual(start);
  expect(await page.evaluate(() => window.CAT_CITY_DEBUG!.stepFishing(5))).toBe(
    5,
  );
  expect((await readWorld(page)).fishing.active!.tick).toBe(start.tick + 5);
  await page.locator('#fish-pause').click();
  expect(await page.evaluate(() => window.CAT_CITY_DEBUG!.stepFishing(5))).toBe(
    0,
  );
  expect(await page.evaluate(() => window.CAT_CITY_DEBUG!.stepFishing(0))).toBe(
    0,
  );
  expect((await readWorld(page)).fishing.active!.tick).toBe(start.tick + 5);
  await page.locator('#fish-pause').click();
  await page.keyboard.up('Space');
  await page.evaluate(() =>
    window.CAT_CITY_DEBUG!.useManualFishingClock(false),
  );
  await expect
    .poll(async () => (await readWorld(page)).fishing.active!.tick)
    .toBeGreaterThan(start.tick + 5);
});
