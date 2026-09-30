import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import { CAT_DEFINITIONS } from '../../src/content/cats';

// Spec 041 T-14 PR 2 (cat-looks.md 2, ui-design 8): a new game starts with a stray by the
// road and the cat maker. Test builds leave it out unless the page asks for it.

const SHOTS = 'artifacts/T-14';
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
] as const;

async function watched(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}
/** No sideways scroll, and no control of the screen under the settings gear. */
async function fits(page: Page, controls: string) {
  const layout = await page.evaluate((selector) => {
    const box = (element: Element) => element.getBoundingClientRect().toJSON();
    return {
      wide: document.documentElement.scrollWidth,
      gear: box(document.querySelector('#settings-gear')!),
      controls: Array.from(document.querySelectorAll(selector), box),
    };
  }, controls);
  expect(layout.wide).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(layout.controls.length).toBeGreaterThan(0);
  for (const control of layout.controls)
    expect(
      control.right <= layout.gear.left ||
        control.left >= layout.gear.right ||
        control.bottom <= layout.gear.top ||
        control.top >= layout.gear.bottom,
      JSON.stringify(control),
    ).toBe(true);
}

for (const size of PHONES) {
  const name = `${size.width}x${size.height}`;
  test(`a new game at ${name}: the stray by the road, then the cat maker`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: size,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = await watched(page);
    await mkdir(SHOTS, { recursive: true });
    try {
      await page.goto(`${localOrigin(testPorts().test)}/?stray-start`);
      await ready(page);
      await expect(page.locator('#stray-start')).toBeVisible();
      await expect(page.locator('#stray-title')).toHaveText(
        '路边捡到一只流浪猫',
      );
      await expect(page.locator('#stray-look')).toBeInViewport({ ratio: 1 });
      await fits(page, '#stray-start button');
      await page.screenshot({ path: `${SHOTS}/stray-${name}.png` });

      await page.locator('#stray-look').tap();
      await expect(page.locator('#cat-maker')).toBeVisible();
      await expect(page.locator('#stray-start')).toBeHidden();
      await expect(
        page.locator('#cat-maker [data-item="breed"][aria-checked="true"]'),
      ).toHaveAttribute('data-option', 'DOMESTIC');
      for (const id of ['random', 'cancel', 'confirm'])
        await expect(page.locator(`#cat-maker-${id}`)).toBeInViewport({
          ratio: 1,
        });
      await fits(page, '#cat-maker button');
      await page.screenshot({ path: `${SHOTS}/stray-maker-${name}.png` });

      for (const [item, option] of [
        ['breed', 'BRITISH_SHORTHAIR'],
        ['colour', 'black'],
        ['white', 'mittens'],
      ])
        await page
          .locator(`#cat-maker [data-item="${item}"][data-option="${option}"]`)
          .tap();
      await page.locator('#cat-maker-confirm').tap();
      await expect(page.locator('#cat-maker')).toHaveCount(0);
      await expect(page.locator('#stray-start')).toBeHidden();
      const [mochi] = (await readWorld(page)).cats;
      expect(mochi!.breedId).toBe('BRITISH_SHORTHAIR');
      expect(mochi!.appearance).toEqual({
        ...CAT_DEFINITIONS.MOCHI.appearance,
        colour: 'black',
        white: 'mittens',
      });
      // Saved: the page comes back to this game, not to another stray.
      await page.reload();
      await ready(page);
      await expect(page.locator('#stray-start')).toBeHidden();
      await expect(page.locator('#notice')).toContainText('欢迎回来');
      expect((await readWorld(page)).cats[0]!.breedId).toBe(
        'BRITISH_SHORTHAIR',
      );
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
