import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { ready } from '../../harness/adapters/catcity/browser';
import { pairAndStranger } from '../helpers/family';

// Spec 041 T-21 (ui-design 5.4, 8): who the selected cat could have a kitten with, on
// a phone. The list only reads the world; the conditions are unit-tested in Core.

/** ui-design 8: the task's screenshots, at both phone sizes. */
const SHOTS = 'artifacts/T-21';
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
] as const;

for (const size of PHONES) {
  const name = `${size.width}x${size.height}`;
  test(`the list of partners opens by touch and fits a ${name} phone`, async ({
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
      // Mochi and Pepper, Pepper just short of happy, and a second Mochi, a stranger yet.
      await page.addInitScript((save) => {
        if (localStorage.getItem('cat-city.save.v1') === null)
          localStorage.setItem('cat-city.save.v1', save);
      }, pairAndStranger().save());
      await page.goto(`${localOrigin(testPorts().test)}/`);
      await ready(page);
      await page.locator('#city-tab-cats').tap();
      const open = page.locator('#breed-open');
      await expect(open).toHaveText('Mochi 和谁生小猫…');
      await open.tap();
      await expect(open).toHaveAttribute('aria-expanded', 'true');
      const rows = page.locator('#breed-partners > li');
      await expect(rows).toHaveCount(2);
      await expect(rows.first()).toContainText('Pepper 现在不够开心');
      await expect(rows.last()).toContainText('需要一公一母');
      await expect(rows.first()).toBeInViewport();
      // The panel keeps its title and way back; the list stays between its sides and
      // the page never scrolls sideways.
      await expect(page.locator('#river-tools-close')).toBeInViewport();
      const panel = (await page.locator('#river-tools').boundingBox())!;
      const list = (await page.locator('#breed-list').boundingBox())!;
      expect(list.x).toBeGreaterThanOrEqual(panel.x);
      expect(list.x + list.width).toBeLessThanOrEqual(panel.x + panel.width);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({ path: `${SHOTS}/breed-list-${name}.png` });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
