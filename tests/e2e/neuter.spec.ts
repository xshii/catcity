import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import { NEUTER_PRICE } from '../../src/content/family';
import { readyPair } from '../helpers/family';

// Spec 041 T-20 (ui-design 4.2, 5.2, 8): neutering from a cat's family on a phone, after
// the confirmation. Core's rules and the dialog's keys are tested without a browser; this
// checks touch, the dialog's place on the screen and that the choice survives a reload.

/** ui-design 8: the task's screenshots, at both phone sizes. */
const SHOTS = 'artifacts/T-20';
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
] as const;

/** Mochi's detail with its family section open, by touch. */
async function openFamily(page: Page) {
  await page.locator('#city-tab-cats').tap();
  await page.locator('[data-cat-details="mochi"]').tap();
  await page.locator('#profile-toggle-family').tap();
}

/** What is drawn on top at the middle of each of the dialog's buttons. */
const onTopOfButtons = (page: Page) =>
  page.evaluate(() =>
    ['confirm-cancel', 'confirm-ok'].map((id) => {
      const box = document.getElementById(id)!.getBoundingClientRect();
      return document.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2,
      )?.id;
    }),
  );

for (const size of PHONES) {
  const name = `${size.width}x${size.height}`;
  test(`neutering asks first, by touch, and lasts through a reload on a ${name} phone`, async ({
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
      // Mochi and Pepper, ready to have a kitten, with 700 coins (tests/helpers/family.ts).
      await page.addInitScript((save) => {
        if (localStorage.getItem('cat-city.save.v1') === null)
          localStorage.setItem('cat-city.save.v1', save);
      }, readyPair().save());
      await page.goto(`${localOrigin(testPorts().test)}/`);
      await ready(page);
      const coins = (await readWorld(page)).coins;
      await openFamily(page);
      const neuter = page.locator('#profile-neuter');
      await expect(neuter).toHaveText('绝育…');
      await neuter.tap();

      // ui-design 4.2: whole on the screen, over everything, cancel with the focus.
      const dialog = page.locator('#confirm');
      await expect(dialog).toBeVisible();
      await expect(dialog).toBeInViewport({ ratio: 1 });
      await expect(page.locator('#confirm-title')).toHaveText(
        '给 Mochi 做绝育？',
      );
      await expect(dialog).toContainText('这件事不能撤销。');
      await expect(page.locator('#confirm-cost')).toHaveText(
        `花费 ${NEUTER_PRICE} 金币`,
      );
      await expect(page.locator('#confirm-cancel')).toBeFocused();
      for (const id of ['#confirm-cancel', '#confirm-ok'])
        expect((await page.locator(id).boundingBox())!.height).toBeGreaterThan(
          43,
        );
      expect(await onTopOfButtons(page)).toEqual([
        'confirm-cancel',
        'confirm-ok',
      ]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({ path: `${SHOTS}/neuter-confirm-${name}.png` });

      // Cancel sends nothing.
      await page.locator('#confirm-cancel').tap();
      await expect(dialog).toBeHidden();
      let world = await readWorld(page);
      expect(world.coins).toBe(coins);
      expect(world.cats[0]!.neutered).toBe(false);

      // Confirming neuters Mochi; "已绝育" takes the button's place.
      await neuter.tap();
      await page.locator('#confirm-ok').tap();
      await expect(dialog).toBeHidden();
      await expect(neuter).toBeHidden();
      await expect(page.locator('.profile-status')).toHaveText('已绝育');
      world = await readWorld(page);
      expect(world.coins).toBe(coins - NEUTER_PRICE);
      expect(world.cats[0]!.neutered).toBe(true);

      // Saved: after a reload it is still so.
      await page.reload();
      await ready(page);
      await openFamily(page);
      await expect(page.locator('.profile-status')).toHaveText('已绝育');
      await expect(neuter).toBeHidden();
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
