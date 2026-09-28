import { enterRiver } from '../../harness/adapters/catcity/city-input';
import { expect, test } from '@playwright/test';
import { catchFish } from '../../harness/adapters/catcity/angling-input';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import {
  closeRiverPanel,
  openGear,
} from '../../harness/adapters/catcity/navigation';

test('scene input aims at water, cat cards switch independent stamina, and the city clock completes rest', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await ready(page);
  await enterRiver(page);
  const arrival = await readWorld(page);
  const canvas = page.locator('canvas');
  const bounds = (await canvas.boundingBox())!;
  await canvas.click({
    position: { x: (bounds.width * 330) / 640, y: (bounds.height * 250) / 640 },
  });
  await expect(page.locator('#fish-direction')).toHaveValue('-45');
  await openGear(page);
  await page.locator('[data-bait="WORM"]').click();
  await expect(page.locator('#fish-bait')).toHaveValue('WORM');
  await closeRiverPanel(page);
  await page.locator('#cast-start').click();
  await expect(page.locator('#fishing-stage #fish-control')).toBeVisible();
  await page.locator('#fish-cancel').click();
  expect((await readWorld(page)).cats[0]!.needs.energy).toBe(
    arrival.cats[0]!.needs.energy - 8,
  );
  await page.locator('#fish-rest').click();
  expect((await readWorld(page)).minute).toBe(arrival.minute);
  await expect(page.locator('[data-cat-id="mochi"]')).toContainText(
    '休息中 60 分钟',
  );
  await page.locator('#invite-pepper').click();
  const pepper = (await readWorld(page)).cats[1]!;
  await page.locator(`[data-cat-id="${pepper.id}"]`).click();
  await enterRiver(page);
  const pepperArrival = await readWorld(page);
  await page.locator('#cast-start').click();
  await page.locator('#fish-cancel').click();
  const pepperEnergy = pepperArrival.cats[1]!.needs.energy - 8;
  expect((await readWorld(page)).cats[1]!.needs.energy).toBe(pepperEnergy);
  await page.locator('#time-forward').click();
  expect((await readWorld(page)).cats.map((cat) => cat.needs.energy)).toEqual([
    100,
    pepperEnergy,
  ]);
  expect((await readWorld(page)).minute).toBe(pepperArrival.minute + 60);
  const before = await readWorld(page);
  await page.reload();
  await ready(page);
  expect(await readWorld(page)).toEqual(before);
  await enterRiver(page);
  await page.screenshot({
    path: testInfo.outputPath('cat-rest-scene.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('real fishing inputs trigger optional haptics; switching it off stops further pulses', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const calls: (number | number[])[] = [];
    Object.assign(window, { vibrationCalls: calls });
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      writable: true,
      value: (pattern: number | number[]) => {
        calls.push(pattern);
        return true;
      },
    });
  });
  await page.goto('/');
  await ready(page);
  await enterRiver(page);
  await openGear(page, 'supplies');
  await expect(page.locator('#haptics-toggle')).toHaveText('震动：开');
  await closeRiverPanel(page);
  await page.locator('#cast-start').click();
  await catchFish(page);
  await expect(page.locator('#catch-reveal')).toContainText('银鱼');
  const calls = () =>
    page.evaluate(
      () =>
        (window as typeof window & { vibrationCalls: (number | number[])[] })
          .vibrationCalls,
    );
  expect(await calls()).toEqual([[12, 35, 12], 25, [30, 45, 55]]);
  await openGear(page, 'supplies');
  await page.locator('#haptics-toggle').click();
  await expect(page.locator('#haptics-toggle')).toHaveText('震动：关');
  const disabled = await calls();
  expect(disabled.at(-1)).toBe(0);
  await closeRiverPanel(page);
  await page.locator('#cast-start').click();
  await page.locator('#fish-control').focus();
  await page.keyboard.down('Space');
  await expect
    .poll(async () =>
      Number(await page.locator('#angling-bar').getAttribute('aria-valuenow')),
    )
    .toBeGreaterThanOrEqual(60);
  await page.keyboard.up('Space');
  await expect(page.locator('#angling-bar')).toHaveAttribute(
    'data-phase',
    'hook',
    {
      timeout: 8000,
    },
  );
  // Deliberately strike outside the visible green zone to exercise failure feedback.
  await expect
    .poll(
      () =>
        page.locator('#angling-bar').evaluate((bar) => {
          const value = Number(bar.getAttribute('aria-valuenow'));
          return (
            value < Number(bar.dataset.low) - 8 ||
            value > Number(bar.dataset.high) + 8
          );
        }),
      { intervals: [25], timeout: 8000 },
    )
    .toBe(true);
  await page.keyboard.down('Space');
  await expect(page.locator('#angling-live')).toBeHidden();
  await page.keyboard.up('Space');
  expect(await calls()).toEqual(disabled);
  expect((await readWorld(page)).fishing.lastResult!.caught).toBe(false);
  expect(errors).toEqual([]);
  await page
    .locator('#fishing-stage')
    .screenshot({ path: testInfo.outputPath('fishing-scene.png') });
});

test('browsers without vibration retain visual controls and do not change gameplay', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      writable: true,
      value: undefined,
    }),
  );
  await page.goto('/');
  await ready(page);
  await enterRiver(page);
  await openGear(page, 'supplies');
  await expect(page.locator('#haptics-toggle')).toBeDisabled();
  await expect(page.locator('#haptics-toggle')).toHaveText(
    '此浏览器不支持震动',
  );
  await closeRiverPanel(page);
  const before = await readWorld(page);
  await page.locator('#cast-start').click();
  await expect(page.locator('#fish-control')).toBeVisible();
  expect((await readWorld(page)).cats[0]!.needs.energy).toBe(
    before.cats[0]!.needs.energy - 8,
  );
  expect(errors).toEqual([]);
});

test('city clock updates preserve the focused cat card and render fixture names literally', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  await enterRiver(page);
  const card = page.locator('[data-cat-id="mochi"]');
  const mounted = await card.elementHandle();
  await card.focus();
  await page.evaluate(() => window.CAT_CITY_DEBUG!.advanceTime(1));
  await expect(card).toBeFocused();
  expect(await mounted.evaluate((element) => element.isConnected)).toBe(true);
  // A pond-shore spawn arrives at full energy; spend a cast so rest is available.
  await page.locator('#cast-start').click();
  await page.locator('#fish-cancel').click();
  const tired = (await readWorld(page)).cats[0]!.needs.energy;
  expect(tired).toBeLessThan(100);
  await page.locator('#fish-rest').click();
  await card.focus();
  await page.evaluate(() => window.CAT_CITY_DEBUG!.advanceTime(10));
  await expect(card).toBeFocused();
  await expect(card).toContainText('休息中 50 分钟');
  await expect(card.locator('progress')).toHaveJSProperty('value', tired + 5);
  const name = 'Mochi <b>你好</b>';
  await page.evaluate((catName) => {
    const save = JSON.parse(localStorage.getItem('cat-city.save.v1')!);
    save.world.cats[0].name = catName;
    window.CAT_CITY_DEBUG!.loadFixture({ save: JSON.stringify(save) });
  }, name);
  await expect(card.locator('strong')).toHaveText(name);
  await expect(card.locator('strong b')).toHaveCount(0);
  expect(await mounted.evaluate((element) => element.isConnected)).toBe(true);
});
