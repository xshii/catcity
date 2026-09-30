import { mkdir } from 'node:fs/promises';
import { expect, test, type Locator } from '@playwright/test';
import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { ready } from '../../harness/adapters/catcity/browser';
import { fullCity } from '../helpers/world';

// Spec 041 T-12 (ui-design 5.1, 8): ten cats in the cats panel on a phone. What the
// roster shows is unit-tested in cats/screen.ts; this checks the layout.

/** ui-design 8: the task's screenshots, at both phone sizes. */
const SHOTS = 'artifacts/T-12';
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
] as const;

type Box = { x: number; y: number; width: number; height: number };
const box = async (locator: Locator): Promise<Box> =>
  (await locator.boundingBox())!;
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

for (const size of PHONES) {
  const name = `${size.width}x${size.height}`;
  test(`ten cats scroll down the roster, never sideways, on a ${name} phone`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: size,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await mkdir(SHOTS, { recursive: true });
    try {
      // The companion limit, made by Core commands (tests/helpers/world.ts).
      await page.addInitScript((save) => {
        if (localStorage.getItem('cat-city.save.v1') === null)
          localStorage.setItem('cat-city.save.v1', save);
      }, fullCity().save());
      await page.goto(`${localOrigin(testPorts().test)}/`);
      await ready(page);
      await page.locator('#city-tab-cats').tap();
      const rows = page.locator('#cat-energy-cards > li');
      await expect(rows).toHaveCount(10);
      await expect(rows.first()).toBeInViewport();
      const sheet = await box(page.locator('#river-tools'));
      const scroller = page.locator('#cats-page-roster');
      // One column between the panel's sides: nothing scrolls sideways.
      for (const row of [rows.first(), rows.last()]) {
        const shown = await box(row);
        expect(shown.x).toBeGreaterThanOrEqual(sheet.x);
        expect(shown.x + shown.width).toBeLessThanOrEqual(
          sheet.x + sheet.width,
        );
      }
      expect(
        await scroller.evaluate((list) => list.scrollWidth <= list.clientWidth),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({ path: `${SHOTS}/roster-${name}.png` });

      // Longer than the panel: the roster page scrolls inside it down to the last cat,
      // whole; the panel's title and tabs stay, and it keeps off the tool bar.
      expect(
        await scroller.evaluate(
          (list) => list.scrollHeight > list.clientHeight,
        ),
      ).toBe(true);
      await rows.last().scrollIntoViewIfNeeded();
      const last = await box(rows.last());
      const shown = await box(scroller);
      expect(last.y).toBeGreaterThanOrEqual(shown.y);
      expect(last.y + last.height).toBeLessThanOrEqual(shown.y + shown.height);
      expect(shown.y + shown.height).toBeLessThanOrEqual(
        sheet.y + sheet.height,
      );
      await expect(page.locator('#river-tools-close')).toBeInViewport();
      await expect(page.locator('#cats-tab-roster')).toBeInViewport();
      expect(overlap(sheet, await box(page.locator('#city-tools-nav')))).toBe(
        false,
      );
      await page.screenshot({ path: `${SHOTS}/roster-end-${name}.png` });

      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
