import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { ready } from '../../harness/adapters/catcity/browser';
import { clickTile } from '../../harness/adapters/catcity/city-input';
import { ARRIVAL_MINUTES } from '../../src/content/residents';
import { createWorld, residentIdentity } from '../../src/core';

// Spec 041 T-30 (ui-design 5.7 and 8): tapping a lodge on a phone shows who lives there.

/** ui-design 8: the task's screenshots, at both phone sizes. */
const SHOTS = 'artifacts/T-30';
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
] as const;
const LODGE = { x: 4, y: 4 };

/** A new game on seed 42 whose lodge three residents have moved into, through Core. */
function lodgeOfThree() {
  const world = createWorld(42);
  world.dispatch({
    type: 'BUILD_BUILDING',
    buildingType: 'CAT_LODGE',
    position: LODGE,
  });
  const minute = world.getSnapshot().minute;
  world.dispatch({
    type: 'ADVANCE_TIME',
    minutes: 3 * ARRIVAL_MINUTES - (minute % ARRIVAL_MINUTES),
  });
  const { residents } = world.getSnapshot();
  expect(residents).toHaveLength(3);
  return {
    save: world.save(),
    names: residents.map(({ id }) => residentIdentity(42, id).name),
  };
}

for (const size of PHONES) {
  test(`phone ${size.width}×${size.height}: a tapped lodge shows how many live there and their names`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize(size);
    await page.goto('/');
    await ready(page);
    const { save, names } = lodgeOfThree();
    await page.evaluate(
      (save) => window.CAT_CITY_DEBUG!.loadFixture({ save }),
      save,
    );
    await clickTile(page, LODGE.x, LODGE.y);
    await expect(page.locator('#city-selection-label')).toHaveText('居民楼');
    await expect(page.locator('#city-action-detail')).toHaveText(
      `居民 3/4 · ${names.join('、')} · 下一位居民明天搬来`,
    );
    await expect(page.locator('#move-building')).toBeVisible();

    // The whole card is on the screen, its text is not cut, nothing scrolls sideways.
    const shown = await page.evaluate(() => {
      const card = document.getElementById('city-action-card')!;
      const detail = document.getElementById('city-action-detail')!;
      const { x, y, width, height } = card.getBoundingClientRect();
      return {
        card: { x, y, width, height },
        viewport: { width: innerWidth, height: innerHeight },
        pageWidth: document.documentElement.scrollWidth,
        detailCut: detail.scrollWidth - detail.clientWidth,
      };
    });
    expect(shown.pageWidth).toBeLessThanOrEqual(size.width);
    expect(shown.card.x).toBeGreaterThanOrEqual(0);
    expect(shown.card.y).toBeGreaterThanOrEqual(0);
    expect(shown.card.x + shown.card.width).toBeLessThanOrEqual(
      shown.viewport.width + 0.5,
    );
    expect(shown.card.y + shown.card.height).toBeLessThanOrEqual(
      shown.viewport.height + 0.5,
    );
    expect(shown.detailCut).toBeLessThanOrEqual(1);
    await mkdir(SHOTS, { recursive: true });
    await page.screenshot({
      path: `${SHOTS}/lodge-card-${size.width}x${size.height}.png`,
    });
    expect(errors).toEqual([]);
  });
}
