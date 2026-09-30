import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import { clickTile, settle } from '../../harness/adapters/catcity/city-input';
import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { RESTYLE_PRICE } from '../../src/content/city';
import { createWorld, World } from '../../src/core';
import { invite } from '../helpers/world';

// Spec 041 T-15 (cat-looks.md 3 and 4, ui-design 8): the cat salon on two phones, from a
// tap on the salon to a new look on the map.

/** ui-design 8: the task's screenshots, at both phone sizes. */
const SHOTS = 'artifacts/T-15';
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
] as const;
const SALON = { x: 4, y: 4 };

/** A new game with the salon on (4,4), Pepper, and coins for a few restyles; by Core. */
function withSalon() {
  const world = new World({ ...createWorld(42).getSnapshot(), coins: 10_000 });
  world.dispatch({
    type: 'BUILD_BUILDING',
    buildingType: 'CAT_SALON',
    position: SALON,
  });
  invite(world);
  return new World({ ...world.getSnapshot(), coins: 1000 }).save();
}

type Box = { x: number; y: number; width: number; height: number };
const apart = (a: Box, b: Box) =>
  a.x + a.width <= b.x ||
  b.x + b.width <= a.x ||
  a.y + a.height <= b.y ||
  b.y + b.height <= a.y;

/** The card and what it must stay clear of, measured in one page call. */
const cardLayout = (page: Page) =>
  page.evaluate(() => {
    const box = (selector: string) =>
      document.querySelector(selector)!.getBoundingClientRect().toJSON();
    return {
      pageWidth: document.documentElement.scrollWidth,
      card: box('#city-action-card'),
      heading: box('#map-heading'),
      nav: box('#city-tools-nav'),
      gear: box('#settings-gear'),
      buttons: Array.from(
        document.querySelectorAll('#city-action-buttons button'),
        (button) => button.getBoundingClientRect().toJSON(),
      ),
    };
  });

/**
 * A picture of the map around a tile, the cat standing there, in a fresh overview: the
 * same framing each time, whatever the camera did in between.
 */
async function tileShot(page: Page, position: { x: number; y: number }) {
  const overview = page.locator('#city-overview');
  if ((await overview.getAttribute('aria-pressed')) === 'true')
    await overview.tap();
  await overview.tap();
  await settle(page);
  const at = await page.evaluate(
    (tile) => window.CAT_CITY_DEBUG!.getTileScreenPosition(tile),
    position,
  );
  expect(at).not.toBeNull();
  return page.screenshot({
    clip: { x: at!.x - 18, y: at!.y - 24, width: 36, height: 40 },
  });
}

for (const size of PHONES) {
  const name = `${size.width}x${size.height}`;
  test(`the cat salon at ${name}: pick a cat, restyle it, see it on the map`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: size,
      isMobile: true,
      hasTouch: true,
      // The cats stand still, so two pictures of the map differ only by the look.
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await mkdir(SHOTS, { recursive: true });
    try {
      await page.goto(`${localOrigin(testPorts().test)}/`);
      await ready(page);
      await page.evaluate(
        (save) => window.CAT_CITY_DEBUG!.loadFixture({ save }),
        withSalon(),
      );
      const before = await readWorld(page);
      const [mochi, pepper] = before.cats;
      // Notices come and go over the map; the pictures of it leave them out.
      await page.addStyleTag({
        content: '#notice { visibility: hidden !important; }',
      });
      const mochiOnMap = await tileShot(page, mochi!.position);
      // The picture is steady: taken again, it is the same.
      expect((await tileShot(page, mochi!.position)).equals(mochiOnMap)).toBe(
        true,
      );

      // Tap the salon: its card lists every companion.
      await clickTile(page, SALON.x, SALON.y);
      await expect(page.locator('#city-selection-label')).toHaveText(
        '猫咪美容院',
      );
      await expect(page.locator('#city-action-buttons button')).toHaveText([
        '移动建筑',
        '给 Mochi 改造',
        '给 Pepper 改造',
      ]);
      await expect(page.locator(`#restyle-${pepper!.id}`)).toBeEnabled();
      const card = await cardLayout(page);
      expect(card.pageWidth).toBeLessThanOrEqual(size.width);
      expect(card.card.x).toBeGreaterThanOrEqual(0);
      expect(card.card.x + card.card.width).toBeLessThanOrEqual(size.width);
      for (const part of [card.heading, card.nav, card.gear])
        expect(apart(card.card, part), JSON.stringify(part)).toBe(true);
      for (const button of card.buttons)
        expect(button.y + button.height).toBeLessThanOrEqual(
          card.card.y + card.card.height,
        );
      await page.screenshot({ path: `${SHOTS}/salon-pick-${name}.png` });

      // Mochi's maker: no breed, the price on confirm; it fits the phone.
      await page.locator('#restyle-mochi').tap();
      const maker = page.locator('#cat-maker');
      await expect(maker).toBeVisible();
      await expect(page.locator('#cat-maker [data-item="breed"]')).toHaveCount(
        0,
      );
      await expect(page.locator('#cat-maker-confirm')).toHaveText(
        `改造 · ${RESTYLE_PRICE} 金币`,
      );
      for (const id of ['random', 'cancel', 'confirm'])
        await expect(page.locator(`#cat-maker-${id}`)).toBeInViewport({
          ratio: 1,
        });
      const wide = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        maker: document.querySelector('#cat-maker')!.scrollWidth,
      }));
      expect(wide.page).toBeLessThanOrEqual(size.width);
      expect(wide.maker).toBeLessThanOrEqual(size.width);
      const black = page.locator(
        '#cat-maker [data-item="colour"][data-option="black"]',
      );
      await black.scrollIntoViewIfNeeded();
      await black.tap();
      await expect(black).toHaveAttribute('aria-checked', 'true');
      await page.screenshot({ path: `${SHOTS}/salon-maker-${name}.png` });

      await page.locator('#cat-maker-confirm').tap();
      await expect(maker).toHaveCount(0);
      const after = await readWorld(page);
      expect(after.cats[0]!.appearance).toEqual({
        ...mochi!.appearance,
        colour: 'black',
      });
      expect(after.cats[0]!.breedId).toBe(mochi!.breedId);
      expect(after.coins).toBe(before.coins - RESTYLE_PRICE);
      await expect(page.locator('#notice')).toHaveText(
        `Mochi 换了新样子，改造花了 ${RESTYLE_PRICE} 金币。`,
      );

      // The map draws the new look where Mochi stands; a reload keeps it.
      await page.locator('#cancel-city-action').tap();
      expect((await tileShot(page, mochi!.position)).equals(mochiOnMap)).toBe(
        false,
      );
      await page.reload();
      await ready(page);
      expect((await readWorld(page)).cats[0]!.appearance).toEqual(
        after.cats[0]!.appearance,
      );
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
