import { mkdir } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import { PEPPER_ID, readyPair } from '../helpers/family';

// Spec 041 T-22 (R-32; ui-design 4.2, 5.4, 8): a kitten from the list of partners on a
// phone, by touch: the confirmation, the name box, the card of its birth, and the kitten
// in the roster and its detail after a reload. Core's rules and the dialogs' keys are
// tested without a browser (tests/unit/breed.test.ts, tests/view/kitten.test.ts).

/** ui-design 8: the task's screenshots, at both phone sizes. */
const SHOTS = 'artifacts/T-22';
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
] as const;

/** Once its fade or pop is over, or the screenshot shows the page through it. */
const settled = (locator: Locator) =>
  locator.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

for (const size of PHONES) {
  const name = `${size.width}x${size.height}`;
  test(`a kitten is asked for, named and born by touch, and lasts through a reload on a ${name} phone`, async ({
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
      // Mochi and Pepper, ready to have a kitten (tests/helpers/family.ts).
      await page.addInitScript((save) => {
        if (localStorage.getItem('cat-city.save.v1') === null)
          localStorage.setItem('cat-city.save.v1', save);
      }, readyPair().save());
      await page.goto(`${localOrigin(testPorts().test)}/`);
      await ready(page);
      await page.locator('#city-tab-cats').tap();
      await page.locator('#breed-open').tap();
      const way = page.locator(`[data-breed-with="${PEPPER_ID}"]`);
      await expect(way).toHaveText('生小猫…');
      await way.scrollIntoViewIfNeeded();
      await way.tap();

      // ui-design 4.2: the question, whole on the screen, cancel with the focus.
      const dialog = page.locator('#confirm');
      await expect(dialog).toBeInViewport({ ratio: 1 });
      await expect(page.locator('#confirm-title')).toHaveText(
        'Mochi 和 Pepper 要有小猫了',
      );
      await expect(page.locator('#confirm-cancel')).toBeFocused();
      await settled(dialog);
      await page.screenshot({ path: `${SHOTS}/kitten-confirm-${name}.png` });
      await page.locator('#confirm-ok').tap();

      // The name box: the first suggestion in the field, the keyboard down.
      const box = page.locator('#name-dialog');
      await expect(box).toBeInViewport({ ratio: 1 });
      await expect(page.locator('#name-title')).toHaveText('给小猫起个名字');
      const chips = box.locator('[role="radio"]');
      await expect(page.locator('#name-input')).toHaveValue(
        (await chips.first().textContent())!,
      );
      await expect(page.locator('#name-input')).not.toBeFocused();
      await page.screenshot({ path: `${SHOTS}/kitten-name-${name}.png` });
      const kittenName = (await chips.nth(1).textContent())!;
      await chips.nth(1).tap();
      await page.locator('#name-confirm').tap();

      // ui-design 5.4 step 3: the card of the birth, whole, its button a thumb's size.
      const card = page.locator('#birth-card');
      await expect(card).toBeInViewport({ ratio: 1 });
      await expect(page.locator('#birth-title')).toHaveText(
        `${kittenName} 出生了`,
      );
      await expect(page.locator('#birth-see')).toBeFocused();
      expect(
        (await page.locator('#birth-see').boundingBox())!.height,
      ).toBeGreaterThan(43);
      expect(await noSideScroll(page)).toBe(true);
      await settled(card);
      await page.screenshot({ path: `${SHOTS}/kitten-born-${name}.png` });
      let world = await readWorld(page);
      const kitten = world.cats.at(-1)!;
      expect(world.cats).toHaveLength(3);
      expect(kitten).toMatchObject({ name: kittenName, generation: 2 });
      await page.locator('#birth-see').tap();
      await expect(card).toHaveCount(0);

      // Selected, in the roster; its detail names its parents.
      const row = page.locator(`[data-cat-id="${kitten.id}"]`);
      await expect(row).toHaveAttribute('aria-pressed', 'true');
      await page.locator(`[data-cat-details="${kitten.id}"]`).tap();
      await expect(page.locator('#profile-about')).toContainText('二代目');
      await page.locator('#profile-toggle-family').tap();
      await expect(page.locator('#profile-family')).toContainText(
        '妈妈 Mochi · 爸爸 Pepper',
      );
      await page.screenshot({ path: `${SHOTS}/kitten-detail-${name}.png` });

      // Saved: after a reload it is still there.
      await page.reload();
      await ready(page);
      world = await readWorld(page);
      expect(world.cats.map((cat) => cat.name)).toContain(kittenName);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
