import { mkdir, readFile } from 'node:fs/promises';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import { settle } from '../../harness/adapters/catcity/city-input';
import { CAT_BREED_IDS, CAT_BREEDS } from '../../src/content/breeds';
import { CAT_COATS } from '../../src/content/cats';
import { createWorld } from '../../src/core/world';
import { invite } from '../helpers/world';
import {
  CAT_ART,
  portraitShapes,
  type CatLook,
  type CatPose,
} from '../../src/view/art/cat-look';
import { catPortrait, shapeSvg } from '../../src/view/art/illustrations';

// Spec 041 T-13 (R-15, ui-design 2.2 and 6.1): coats and breeds drawn apart.

/** ui-design 8: the task's screenshots. */
const SHOTS = 'artifacts/T-13';
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
] as const;
/** Labels of the sheet only; the game names no coat yet. */
const COAT_NAMES = {
  cream: '奶油',
  gray: '灰',
  orange: '橘',
  tuxedo: '黑白',
} as const;

async function watched(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

/**
 * The comparison sheet, built from the renderers' own shapes: each cell has the cat as
 * the map draws it (the tail behind the head), its roster portrait, and dozing.
 */
function sheet(tokens: string) {
  const awake: CatPose = { face: 'calm', ears: 'up', curled: false };
  const svg = (shapes: string) =>
    `<svg viewBox="2 0 84 64" aria-hidden="true">${shapes}</svg>`;
  const figure = ({ coat, breed }: CatLook) =>
    svg(
      [...CAT_ART.breeds[breed].tail, ...portraitShapes(breed, awake)]
        .map((shape) => shapeSvg(shape, coat))
        .join(''),
    );
  const cells = CAT_BREED_IDS.flatMap((breed) =>
    CAT_COATS.map((coat) => {
      const look = { coat, breed };
      return `<figure data-look="${coat}/${breed}">${figure(look)}${catPortrait(look, awake)}${catPortrait(look, { ...awake, curled: true })}<figcaption>${COAT_NAMES[coat]} · ${CAT_BREEDS[breed].name}</figcaption></figure>`;
    }),
  );
  return `<!doctype html><meta charset="utf-8"><style>${tokens}
    body { margin: 0; background: var(--paper); color: var(--text); font: 14px var(--font-ui); }
    #sheet { display: grid; grid-template-columns: repeat(${CAT_COATS.length}, 256px); gap: 12px; padding: 16px; width: max-content; }
    figure { margin: 0; display: grid; grid-template-columns: 126px 60px 60px; align-items: end; gap: 4px; }
    figure svg:first-child { width: 126px; height: 96px; }
    figure svg { width: 60px; height: 60px; }
    figcaption { grid-column: 1 / -1; text-align: center; }
  </style><main id="sheet">${cells.join('')}</main>`;
}

test('a sheet of the 4 coats × 2 breeds, as the map and the roster draw them', async ({
  page,
}) => {
  const errors = await watched(page);
  await mkdir(SHOTS, { recursive: true });
  await page.setContent(
    sheet(await readFile('src/view/styles/tokens.css', 'utf8')),
  );
  const cells = page.locator('#sheet figure');
  await expect(cells).toHaveCount(CAT_COATS.length * CAT_BREED_IDS.length);
  for (const cell of await cells.all())
    await expect(cell.locator('svg')).toHaveCount(3);
  await page.locator('#sheet').screenshot({ path: `${SHOTS}/coats.png` });
  expect(errors).toEqual([]);
});

/** Mochi (a cream ragdoll) and Pepper (a gray shorthair) in a save the page loads. */
function twoCats() {
  const world = createWorld(42);
  invite(world);
  return world.save();
}

async function phone(
  browser: Browser,
  size: { width: number; height: number },
) {
  const context = await browser.newContext({
    viewport: size,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = await watched(page);
  await page.addInitScript((save) => {
    if (localStorage.getItem('cat-city.save.v1') === null)
      localStorage.setItem('cat-city.save.v1', save);
  }, twoCats());
  await page.goto(`${localOrigin(testPorts().test)}/`);
  await ready(page);
  return { context, page, errors };
}

for (const size of PHONES) {
  const name = `${size.width}x${size.height}`;
  test(`the map cats and the roster portraits at ${name}`, async ({
    browser,
  }) => {
    const { context, page, errors } = await phone(browser, size);
    await mkdir(SHOTS, { recursive: true });
    try {
      const { cats } = await readWorld(page);
      expect(cats.map((cat) => cat.breedId)).toEqual([
        'RAGDOLL',
        'BRITISH_SHORTHAIR',
      ]);
      // Both cats stand on the map on screen, drawn by Phaser. A narrow phone follows
      // one part of the map; the overview shows the whole of it.
      await page.locator('#city-overview').tap();
      await expect(page.locator('#city-overview')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await settle(page);
      for (const cat of cats) {
        const at = await page.evaluate(
          (position) => window.CAT_CITY_DEBUG!.getTileScreenPosition(position),
          cat.position,
        );
        expect(at, cat.name).not.toBeNull();
        expect(at!.x).toBeGreaterThanOrEqual(0);
        expect(at!.x).toBeLessThanOrEqual(size.width);
        expect(at!.y).toBeGreaterThanOrEqual(0);
        expect(at!.y).toBeLessThanOrEqual(size.height);
      }
      await page.screenshot({ path: `${SHOTS}/map-${name}.png` });
      await page.locator('#city-tab-cats').tap();
      await expect(page.locator('#panel-cats')).toBeVisible();
      for (const cat of cats) {
        const portrait = page.locator(`[data-cat-id="${cat.id}"] svg`);
        await expect(portrait).toBeInViewport({ ratio: 1 });
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({ path: `${SHOTS}/roster-${name}.png` });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
