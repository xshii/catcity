import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import type { CatMakerInput } from '../../src/view/cats/cat-maker-screen';

// Spec 041 T-14 PR 1b (cat-looks.md 4, ui-design 8): the cat maker on two phones, opened
// by the test build's debug bridge until PR 2 opens it at the start of a game.

const SHOTS = 'artifacts/T-14';
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
] as const;
const STRAY: CatMakerInput = {
  pickBreed: true,
  confirm: '就是它了',
  breed: 'DOMESTIC',
  appearance: {
    colour: 'cream',
    pattern: 'solid',
    white: 'none',
    eyes: 'blue',
    face: 'round',
  },
};
/** 🎲's numbers, one per row: a cream tabby shorthair, white below, copper eyes, long face. */
const RANDOMS = [0.99, 0.5, 0.4, 0.99, 0.34, 0.7];
const RANDOM_CAT = {
  breed: 'BRITISH_SHORTHAIR',
  appearance: {
    colour: 'cream',
    pattern: 'tabby',
    white: 'bicolour',
    eyes: 'copper',
    face: 'long',
  },
} as const;

async function watched(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}
/** The chosen option of each row, as the screen marks it. */
const checked = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '#cat-maker [role="radio"][aria-checked="true"]',
        ),
        (radio) => [radio.dataset.item, radio.dataset.option],
      ),
    ),
  );
/** The screen fits the phone: no sideways scroll, and no control under the settings gear. */
async function fits(page: Page) {
  const layout = await page.evaluate(() => {
    const box = (element: Element) => element.getBoundingClientRect().toJSON();
    return {
      wide: document.documentElement.scrollWidth,
      screen: document.querySelector('#cat-maker')!.scrollWidth,
      gear: box(document.querySelector('#settings-gear')!),
      buttons: Array.from(document.querySelectorAll('#cat-maker button'), box),
    };
  });
  const width = page.viewportSize()!.width;
  expect(layout.wide).toBeLessThanOrEqual(width);
  expect(layout.screen).toBeLessThanOrEqual(width);
  for (const button of layout.buttons) {
    const apart =
      button.right <= layout.gear.left ||
      button.left >= layout.gear.right ||
      button.bottom <= layout.gear.top ||
      button.top >= layout.gear.bottom;
    expect(apart, JSON.stringify(button)).toBe(true);
  }
}

for (const size of PHONES) {
  const name = `${size.width}x${size.height}`;
  test(`the cat maker at ${name}: as it opens and after 🎲`, async ({
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
      await page.goto(`${localOrigin(testPorts().test)}/`);
      await ready(page);
      const world = await readWorld(page);
      expect(
        await page.evaluate(
          ([input, randoms]) =>
            window.CAT_CITY_DEBUG!.showCatMaker(input, randoms),
          [STRAY, RANDOMS] as const,
        ),
      ).toBe(true);
      const maker = page.locator('#cat-maker');
      await expect(maker).toBeVisible();
      await expect(page.locator('#cat-maker-preview svg')).toBeInViewport({
        ratio: 1,
      });
      for (const id of ['random', 'cancel', 'confirm'])
        await expect(page.locator(`#cat-maker-${id}`)).toBeInViewport({
          ratio: 1,
        });
      // A short phone scrolls the rows inside the screen, down to the last one.
      const last = page.locator('#cat-maker [data-option="long"]');
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport({ ratio: 1 });
      await page
        .locator('#cat-maker [data-item="breed"]')
        .first()
        .scrollIntoViewIfNeeded();
      expect(await checked(page)).toEqual({
        breed: STRAY.breed,
        ...STRAY.appearance,
      });
      await fits(page);
      await page.screenshot({ path: `${SHOTS}/maker-${name}.png` });

      await page.locator('#cat-maker-random').tap();
      expect(await checked(page)).toEqual({
        breed: RANDOM_CAT.breed,
        ...RANDOM_CAT.appearance,
      });
      await fits(page);
      await page.screenshot({ path: `${SHOTS}/maker-random-${name}.png` });

      await page.locator('#cat-maker-confirm').tap();
      await expect(maker).toHaveCount(0);
      expect(
        await page.evaluate(() => window.CAT_CITY_DEBUG!.getCatMakerOutcome()),
      ).toEqual(RANDOM_CAT);
      // Making a cat sends no command until PR 2 starts a game with it.
      expect(await readWorld(page)).toEqual(world);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
