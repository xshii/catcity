import { mkdir } from 'node:fs/promises';
import { expect, test, type Locator } from '@playwright/test';
import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { ready } from '../../harness/adapters/catcity/browser';
import { crowdedFamily } from '../helpers/family';

// Spec 041 T-21 (ui-design 5.4, 8): who the selected cat could have a kitten with, on
// a phone. The list only reads the world; the conditions are unit-tested in Core.

/** ui-design 8: the task's screenshots, at both phone sizes. */
const SHOTS = 'artifacts/T-21';
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
  test(`the list of partners opens by touch and scrolls inside the panel on a ${name} phone`, async ({
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
      // Mochi and Pepper, Pepper just short of happy, and five copies of Mochi who are
      // strangers yet: a list longer than the panel.
      await page.addInitScript((save) => {
        if (localStorage.getItem('cat-city.save.v1') === null)
          localStorage.setItem('cat-city.save.v1', save);
      }, crowdedFamily().save());
      await page.goto(`${localOrigin(testPorts().test)}/`);
      await ready(page);
      await page.locator('#city-tab-cats').tap();
      const open = page.locator('#breed-open');
      await expect(open).toHaveText('Mochi 和谁生小猫…');
      await open.tap();
      await expect(open).toHaveAttribute('aria-expanded', 'true');
      const rows = page.locator('#breed-partners > li');
      await expect(rows).toHaveCount(6);
      await expect(rows.first()).toContainText('Pepper 现在不够开心');
      await expect(rows.last()).toContainText('需要一公一母');
      await expect(rows.first()).toBeInViewport();
      // The list stays between the panel's sides; the page never scrolls sideways.
      const sheet = await box(page.locator('#river-tools'));
      const list = await box(page.locator('#breed-list'));
      expect(list.x).toBeGreaterThanOrEqual(sheet.x);
      expect(list.x + list.width).toBeLessThanOrEqual(sheet.x + sheet.width);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({ path: `${SHOTS}/breed-list-${name}.png` });

      // Longer than the panel: the roster page scrolls inside it (the tabs stay), down
      // to the last cat, whole.
      const scroller = page.locator('#cats-page-roster');
      expect(
        await scroller.evaluate(
          (panel) => panel.scrollHeight > panel.clientHeight,
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
      // The title, way back and tabs stay; the panel keeps off the tool bar.
      await expect(page.locator('#river-tools-close')).toBeInViewport();
      await expect(page.locator('#cats-tab-roster')).toBeInViewport();
      expect(overlap(sheet, await box(page.locator('#city-tools-nav')))).toBe(
        false,
      );
      await page.screenshot({ path: `${SHOTS}/breed-list-end-${name}.png` });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
