import { CARE } from '../../src/content/care';
import {
  clickTile,
  enterRiver,
  settle,
} from '../../harness/adapters/catcity/city-input';
import { expect, test, type Page } from '@playwright/test';
import { FISHING } from '../../src/content/fishing';
import { WATER_VIEW, waterPoint } from '../../src/view/art/water-view';
import { castOnce } from '../../harness/adapters/catcity/angling-input';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import {
  closeRiverPanel,
  openCats,
  openGear,
} from '../../harness/adapters/catcity/navigation';
import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { CAT_LINES, CAT_TAP_MS } from '../../src/view/fishing/screen';
import {
  askForSensors,
  phoneContext,
  seasoned,
  sensorsOn,
  spin,
} from '../helpers/motion-phone';

test('scene input aims at water, cat cards switch independent stamina, and idle cats recover on the city clock', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await ready(page);
  await enterRiver(page);
  const arrival = await readWorld(page);
  const canvas = page.locator('canvas');
  const bounds = (await canvas.boundingBox())!;
  // Tapping the far left of the water aims hard left.
  const left = waterPoint(-FISHING.input.maxDirection, 0.5);
  await canvas.click({
    position: {
      x: (bounds.width * left.x) / WATER_VIEW.size,
      y: (bounds.height * left.y) / WATER_VIEW.size,
    },
  });
  await expect(page.locator('#fish-direction')).toHaveValue(
    String(-FISHING.input.maxDirection),
  );
  await openGear(page);
  await page.locator('[data-bait="WORM"]').click();
  await expect(page.locator('#fish-bait')).toHaveValue('WORM');
  await closeRiverPanel(page);
  await page.locator('#cast-start').click();
  await expect(page.locator('#fishing-stage #fish-control')).toBeVisible();
  await castOnce(page);
  await page.locator('#fish-cancel').click();
  expect((await readWorld(page)).cats[0]!.needs.energy).toBe(
    arrival.cats[0]!.needs.energy - 8,
  );
  // Aiming again after a cast: the cat fishing with the player sits up, awake (R-01).
  await settle(page);
  await page.screenshot({ path: testInfo.outputPath('awake-after-cast.png') });
  await openCats(page);
  const mochi = page.locator('[data-cat-id="mochi"]');
  await expect(mochi).toHaveAccessibleName(/Mochi/);
  await expect(mochi).not.toHaveAccessibleName(/在休息/);
  // Nothing to press: in the city, an idle, tired cat shows that it is recovering.
  await closeRiverPanel(page);
  await page.locator('#visit-city').click();
  await openCats(page);
  await expect(mochi).toHaveAccessibleName(/在休息/);
  // Pepper needs a bed (spec 041 R-12): an apartment away from the pond, then the invitation.
  await clickTile(page, 3, 4);
  await page.locator('[data-build-type=CAT_APARTMENT]').click();
  await openCats(page);
  await page.locator('#invite-open').click();
  await page.locator('[data-invite-cat="PEPPER"]').click();
  const pepper = (await readWorld(page)).cats[1]!;
  await page.locator(`[data-cat-id="${pepper.id}"]`).click();
  await closeRiverPanel(page);
  await enterRiver(page);
  const pepperArrival = await readWorld(page);
  await page.locator('#cast-start').click();
  await castOnce(page);
  await page.locator('#fish-cancel').click();
  const pepperEnergy = pepperArrival.cats[1]!.needs.energy - 8;
  expect((await readWorld(page)).cats[1]!.needs.energy).toBe(pepperEnergy);
  // The city clock (the browser's real-time adapter in play) recovers idle cats.
  await page.evaluate(() => window.CAT_CITY_DEBUG!.advanceTime(60));
  expect((await readWorld(page)).cats.map((cat) => cat.needs.energy)).toEqual([
    100,
    Math.min(100, pepperEnergy + 6 * CARE.recovery.idle),
  ]);
  expect((await readWorld(page)).minute).toBe(pepperArrival.minute + 60);
  const before = await readWorld(page);
  await page.reload();
  await ready(page);
  expect(await readWorld(page)).toEqual(before);
  await enterRiver(page);
  await page.screenshot({
    path: testInfo.outputPath('cat-recovery-scene.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

type Box = { x: number; y: number; width: number; height: number };
/** Two boxes share no area (touching edges is fine). */
const apart = (a: Box, b: Box) =>
  a.x + a.width <= b.x ||
  b.x + b.width <= a.x ||
  a.y + a.height <= b.y ||
  b.y + b.height <= a.y;
/** What else floats over the river scene (ui-design 3.2): the cat and its bubble keep clear. */
const SCENE_FLOATS = [
  '#settings-gear',
  '#motion-fishing-hint',
  '#motion-hold',
  '#motion-guide-skip',
  '#catch-reveal',
  '#notice',
  '#angling-live',
  '#scene-ready',
];
const phase = async (page: Page) =>
  (await readWorld(page)).fishing.active?.phase ?? null;
/** FISH_STRIKE commands the page has sent. */
const strikes = (page: Page) =>
  page.evaluate(
    () =>
      window
        .CAT_CITY_DEBUG!.getReplay()
        .entries.filter((entry) => entry.command.type === 'FISH_STRIKE').length,
  );

for (const viewport of [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
])
  test(`phone ${viewport.width}×${viewport.height}: touching the cat while fishing gets a line beside it and strikes nothing (R-03)`, async ({
    browser,
  }, testInfo) => {
    const context = await phoneContext(browser, viewport);
    await askForSensors(context);
    await seasoned(context);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${localOrigin(testPorts().test)}/`);
    await ready(page);
    await enterRiver(page);
    await page.evaluate(() =>
      window.CAT_CITY_DEBUG!.useManualFishingClock(true),
    );
    await sensorsOn(page);
    const cat = page.locator('#river-cat');
    const bubble = page.locator('#river-cat-bubble');
    await expect(cat).toHaveAccessibleName('摸摸 Mochi');
    const target = (await cat.boundingBox())!;
    expect(target.width).toBeGreaterThanOrEqual(64);
    expect(target.height).toBeGreaterThanOrEqual(64);
    // The cat's ears reach over the water, where a tap strikes a waiting fish: touched
    // there, it is the cat's.
    const ears = { x: target.width / 2, y: 4 };
    await spin(page, [0, 300, 700, 900, 100, 0]);
    expect(await phase(page)).toBe('waiting');
    await cat.tap({ position: ears });
    await expect(bubble).toHaveText(CAT_LINES.waiting[0]);
    expect(await strikes(page)).toBe(0);
    expect(await phase(page)).toBe('waiting');
    for (let i = 0; i < 200 && (await phase(page)) !== 'hook'; i++)
      await page.evaluate(() => window.CAT_CITY_DEBUG!.stepFishing(1));
    await page.waitForTimeout(
      Math.max(FISHING.motion.gesture.liftCooldownMs, CAT_TAP_MS.repeat),
    );
    await spin(page, [-400]);
    expect(await phase(page)).toBe('fight');
    const hooked = await strikes(page);
    // Fighting the fish: the cat cheers, and the fight goes on untouched.
    await cat.tap({ position: ears });
    await expect(bubble).toHaveText(CAT_LINES.cheer[1]);
    const shown = await page.evaluate((selectors) => {
      const boxOf = (element: Element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      return {
        cat: boxOf(document.querySelector('#river-cat')!),
        bubble: boxOf(document.querySelector('#river-cat-bubble')!),
        others: selectors.flatMap((selector) => {
          const element = document.querySelector(selector);
          if (!element?.checkVisibility({ visibilityProperty: true }))
            return [];
          const box = boxOf(element);
          return box.width && box.height ? [{ selector, box }] : [];
        }),
      };
    }, SCENE_FLOATS);
    await page.screenshot({
      path: testInfo.outputPath(
        `cat-bubble-${viewport.width}x${viewport.height}.png`,
      ),
    });
    expect(await strikes(page)).toBe(hooked);
    expect(await phase(page)).toBe('fight');
    // Beside the cat on the dock, on screen, clear of everything else over the scene.
    expect(shown.bubble.width).toBeGreaterThan(0);
    expect(shown.bubble.x).toBeGreaterThanOrEqual(
      shown.cat.x + shown.cat.width,
    );
    expect(shown.bubble.x + shown.bubble.width).toBeLessThanOrEqual(
      viewport.width,
    );
    expect(shown.bubble.y + shown.bubble.height).toBeLessThanOrEqual(
      viewport.height,
    );
    expect(shown.others.map(({ selector }) => selector)).toContain(
      '#motion-fishing-hint',
    );
    for (const { selector, box } of shown.others) {
      expect(apart(shown.cat, box), selector).toBe(true);
      expect(apart(shown.bubble, box), selector).toBe(true);
    }
    // It has its say for a moment, then gives the scene back.
    await expect(bubble).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
  });
