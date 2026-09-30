import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { INVITABLE_CATS } from '../../src/content/cats';
import { createWorld } from '../../src/core';
import { buildApartment } from '../helpers/world';

// Spec 041 T-11 (ui-design 5.3 and 8): the invite list on a phone.

/** ui-design 8: the task's screenshots, at both phone sizes. */
const SHOTS = 'artifacts/T-11';
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
] as const;

/** A new game with an apartment of two free beds, prepared through Core. */
function withApartment() {
  const world = createWorld(42);
  buildApartment(world);
  return world.save();
}

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;
const inside = (inner: Box, outer: Box) =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.width <= outer.x + outer.width + 0.5 &&
  inner.y + inner.height <= outer.y + outer.height + 0.5;

/** The list's parts and what floats around it, measured in one page call. */
const layout = (page: Page) =>
  page.evaluate(() => {
    const box = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const one = (selector: string) => box(document.querySelector(selector)!);
    const panel = document.getElementById('panel-cats')!;
    return {
      viewport: { x: 0, y: 0, width: innerWidth, height: innerHeight },
      pageWidth: document.documentElement.scrollWidth,
      sheet: one('#river-tools'),
      close: one('#river-tools-close'),
      gear: one('#settings-gear'),
      back: one('#invite-back'),
      title: one('#invite-title'),
      list: one('#invite-list'),
      cards: Array.from(document.querySelectorAll('[data-invite]'), box),
      panelOverflow: panel.scrollHeight - panel.clientHeight,
    };
  });

for (const size of PHONES) {
  test(`phone ${size.width}×${size.height}: the invite list fits the panel, scrolls inside it and invites with a tap`, async ({
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
    try {
      await page.goto(`${localOrigin(testPorts().test)}/`);
      await ready(page);
      await page.evaluate(
        (save) => window.CAT_CITY_DEBUG!.loadFixture({ save }),
        withApartment(),
      );
      await page.locator('#city-tab-cats').tap();
      await page.locator('#invite-open').tap();
      await expect(page.locator('#cat-invite')).toBeVisible();
      await expect(page.locator('#river-roster')).toBeHidden();
      await expect(page.locator('[data-invite]')).toHaveCount(
        INVITABLE_CATS.length,
      );
      await expect(page.locator('#invite-beds')).toHaveText(
        '新伙伴需要一张空床。现有空床：2',
      );

      // Nothing scrolls sideways; the way back and the title sit in the panel, clear of
      // the settings gear and the panel's close button; every card is as wide as the list
      // at most; the panel itself needs no scrolling, only the list does.
      const shown = await layout(page);
      expect(shown.pageWidth).toBeLessThanOrEqual(size.width);
      for (const part of [shown.back, shown.title]) {
        expect(inside(part, shown.sheet)).toBe(true);
        expect(inside(part, shown.viewport)).toBe(true);
        expect(overlap(part, shown.gear)).toBe(false);
        expect(overlap(part, shown.close)).toBe(false);
      }
      expect(inside(shown.list, shown.sheet)).toBe(true);
      for (const card of shown.cards) {
        expect(card.x).toBeGreaterThanOrEqual(shown.list.x - 0.5);
        expect(card.x + card.width).toBeLessThanOrEqual(
          shown.list.x + shown.list.width + 0.5,
        );
      }
      expect(shown.panelOverflow).toBeLessThanOrEqual(1);
      await mkdir(SHOTS, { recursive: true });
      await page.screenshot({
        path: `${SHOTS}/invite-list-${size.width}x${size.height}.png`,
      });

      // The last cat on the list is reached by scrolling the list; the way back stays.
      const lastId = INVITABLE_CATS.at(-1)!;
      const last = page.locator(`[data-invite-cat="${lastId}"]`);
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport({ ratio: 1 });
      await expect(page.locator('#invite-back')).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => scrollY)).toBe(0);

      await last.tap();
      const world = await readWorld(page);
      expect(world.cats.map((cat) => cat.definitionId)).toEqual([
        'MOCHI',
        lastId,
      ]);
      expect(world.cats[1]!.home).toBe(world.buildings[0]!.id);
      await expect(page.locator('#notice')).toContainText(
        '来到了小城，住进了 1 号公寓。',
      );
      // Back on the roster, where the newcomer has its card.
      await expect(page.locator('#cat-invite')).toBeHidden();
      await expect(
        page.locator(`[data-cat-id="${world.cats[1]!.id}"]`),
      ).toBeVisible();
      await expect(page.locator('#invite-open')).toContainText('还能邀请 4 只');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
