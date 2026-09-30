import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { catchFish } from '../../harness/adapters/catcity/angling-input';
import { enterRiver, settle } from '../../harness/adapters/catcity/city-input';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import {
  closeRiverPanel,
  openCats,
  showBagFish,
} from '../../harness/adapters/catcity/navigation';
import { progressSaves } from '../helpers/fishing-progress';

type Box = { x: number; y: number; width: number; height: number };
type Viewport = { width: number; height: number };

const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

/** What floats near the gear, by name: the gear shares no area with any of it. */
const NEAR_GEAR = {
  bar: '#map-heading',
  hint: '.city-map-hint',
  chip: '#river-place',
  notice: '#notice',
  card: '#catch-reveal',
  panelTitle: '#river-tools-title',
  panelClose: '#river-tools-close',
  // The river's cat and its line (R-03), and the aim hint's close in motion play.
  cat: '#river-cat',
  bubble: '#river-cat-bubble',
  hintClose: '#motion-hint-close',
};
/** The bars' gutter at the screen's sides; the gear keeps to it at the right. */
const GUTTER_PX = 8;
/** Two lines of the notice's 11px text at 1.5, its padding, and a pixel of rounding. */
const TWO_LINES_PX = 2 * 11 * 1.5 + 8 + 1;

/**
 * The gear and every visible part near it, read in one page call, with a picture: the
 * gear is finger-sized, at the right edge under the scene bar, over none of them.
 */
async function gearClear(
  page: Page,
  testInfo: TestInfo,
  name: string,
  expected: (keyof typeof NEAR_GEAR)[],
) {
  await settle(page);
  const read = await page.evaluate((parts) => {
    const boxOf = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      gear: boxOf(document.querySelector('#settings-gear')!),
      parts: Object.entries(parts).flatMap(([part, selector]) => {
        const element = document.querySelector(selector);
        if (!element) return [];
        const box = boxOf(element);
        return box.width > 0 &&
          box.height > 0 &&
          element.checkVisibility({ visibilityProperty: true })
          ? [{ part, box }]
          : [];
      }),
    };
  }, NEAR_GEAR);
  const viewport = page.viewportSize()!;
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  const { gear } = read;
  await expect(page.locator('#settings-gear')).toBeInViewport({ ratio: 1 });
  expect(gear.width).toBeGreaterThanOrEqual(44);
  expect(gear.height).toBeGreaterThanOrEqual(44);
  expect(
    Math.abs(viewport.width - (gear.x + gear.width) - GUTTER_PX),
    `${name}: the gear keeps to the right edge`,
  ).toBeLessThanOrEqual(1);
  const bar = (await page.locator('#map-heading').boundingBox())!;
  expect(gear.y, `${name}: the gear is under the scene bar`).toBeGreaterThan(
    bar.y + bar.height,
  );
  expect(read.parts.map(({ part }) => part)).toEqual(
    expect.arrayContaining(expected),
  );
  // Soft: one run reports every part the gear covers.
  for (const { part, box } of read.parts)
    expect
      .soft(overlap(gear, box), `${name}: the gear must not cover the ${part}`)
      .toBe(false);
  return gear;
}

/** Same place, to the pixel. */
function samePlace(a: Box, b: Box) {
  for (const side of ['x', 'y', 'width', 'height'] as const)
    expect(Math.abs(a[side] - b[side]), side).toBeLessThanOrEqual(1);
}

async function openSheet(page: Page) {
  await page.locator('#settings-gear').click();
  await expect(page.locator('#settings-sheet')).toBeVisible();
  await expect(page.locator('#settings-common')).toBeVisible();
}
async function closeSheet(page: Page) {
  await page.locator('#settings-close').click();
  await expect(page.locator('#settings-sheet')).toBeHidden();
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
] satisfies Viewport[])
  test(`phone ${viewport.width}×${viewport.height}: one settings gear, in the same place in the city and on the river, clear of what floats by it`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize(viewport);
    await page.addInitScript((save) => {
      localStorage.setItem('cat-city.save.v1', save);
      localStorage.setItem('cat-city.fishing-input', 'buttons');
    }, progressSaves().reedsOpen);
    await page.goto('/');
    await ready(page);
    const size = `${viewport.width}x${viewport.height}`;

    // The city: beside the next step, over the welcome notice.
    await expect(page.locator('#notice')).not.toBeEmpty();
    const city = await gearClear(page, testInfo, `gear-city-${size}`, [
      'bar',
      'hint',
      'notice',
    ]);
    // Its sheet has the common settings only.
    await openSheet(page);
    await expect(page.locator('#settings-page')).toBeHidden();
    await closeSheet(page);
    // Over an open panel's corner, clear of its title and its close button.
    await openCats(page);
    await gearClear(page, testInfo, `gear-city-panel-${size}`, [
      'panelTitle',
      'panelClose',
    ]);
    await closeRiverPanel(page);

    // The river: the same gear in the same place, beside the spot's name.
    await enterRiver(page);
    await expect(page.locator('#notice')).not.toBeEmpty();
    samePlace(
      await gearClear(page, testInfo, `gear-river-${size}`, [
        'bar',
        'chip',
        'notice',
      ]),
      city,
    );
    await openSheet(page);
    await expect(page.locator('#settings-mode-buttons')).toBeVisible();
    await closeSheet(page);
    // A tap on the cat: its line shows beside it for a moment, checked while it does
    // (fishing-scene.spec keeps the line off the gear through a whole run).
    await page.locator('#river-cat').click();
    await expect(page.locator('#river-cat-bubble')).toBeVisible();
    await gearClear(page, testInfo, `gear-river-cat-${size}`, ['cat']);
    // The river's longest notice, a gift's, stays centred beside the gear in two lines.
    const fish = (await readWorld(page)).fishing.inventory[0]!;
    await showBagFish(page, fish.id);
    await page.locator(`[data-gift-fish="${fish.id}"]`).click();
    await gearClear(page, testInfo, `gear-river-panel-${size}`, [
      'panelTitle',
      'panelClose',
    ]);
    await closeRiverPanel(page);
    await expect(page.locator('#notice')).toContainText('Mochi');
    await gearClear(page, testInfo, `gear-river-gift-${size}`, [
      'chip',
      'notice',
    ]);
    const notice = (await page.locator('#notice').boundingBox())!;
    expect(notice.height).toBeLessThanOrEqual(TWO_LINES_PX);
    expect(
      Math.abs(notice.x + notice.width / 2 - viewport.width / 2),
      'the notice stays centred',
    ).toBeLessThanOrEqual(1);
    // The catch card floats over the water's top, clear of the gear too.
    await page.locator('#cast-start').click();
    await catchFish(page);
    await expect(page.locator('#catch-reveal')).toBeVisible();
    await gearClear(page, testInfo, `gear-river-card-${size}`, ['card']);
    expect(errors).toEqual([]);
  });
