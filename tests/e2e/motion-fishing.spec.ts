import { expect, test, type Page } from '@playwright/test';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import { enterRiver } from '../../harness/adapters/catcity/city-input';
import {
  closeRiverPanel,
  openGear,
} from '../../harness/adapters/catcity/navigation';
import { FISHING } from '../../src/content/fishing';
import { fishPoint } from '../../src/minigames/angling-motion';

/** Synthetic sensors: Chromium exposes the events but never fires them itself. */
async function orient(page: Page, gamma: number, beta: number) {
  await page.evaluate(
    (pose) => {
      const event = new Event('deviceorientation');
      Object.defineProperties(event, {
        gamma: { value: pose.gamma },
        beta: { value: pose.beta },
      });
      window.dispatchEvent(event);
    },
    { gamma, beta },
  );
}
async function spin(page: Page, rates: number[]) {
  await page.evaluate(
    ({ rates, sign }) => {
      for (const rate of rates) {
        const event = new Event('devicemotion');
        Object.defineProperty(event, 'rotationRate', {
          value: { alpha: 0, beta: rate * sign, gamma: 0 },
        });
        window.dispatchEvent(event);
      }
    },
    { rates, sign: FISHING.motion.gesture.pitchSign },
  );
}
const step = (page: Page, ticks = 1) =>
  page.evaluate((n) => window.CAT_CITY_DEBUG!.stepFishing(n), ticks);

async function inMotionRiver(page: Page) {
  // Chromium gates sensors behind permissions; WebKit has no such permission names.
  await page
    .context()
    .grantPermissions(['accelerometer', 'gyroscope'], {
      origin: 'http://127.0.0.1:4173',
    })
    .catch(() => undefined);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await ready(page);
  await enterRiver(page);
  // Desktop browsers default to buttons; opting in asks for sensor permission.
  await openGear(page, 'supplies');
  await page.locator('#motion-mode-toggle').click();
  await closeRiverPanel(page);
  await page.evaluate(() => window.CAT_CITY_DEBUG!.useManualFishingClock(true));
  await orient(page, 0, 0);
  await spin(page, [0]);
  await expect(page.locator('#motion-fishing')).toBeVisible();
  await expect(page.locator('#scene-ready')).toBeHidden();
}

test(
  'a swing casts, "!" asks for a lift, and following the fish ring lands it',
  { tag: '@motion-smoke' },
  async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await inMotionRiver(page);
    const before = await readWorld(page);
    expect(before.fishing.active).toBeNull();
    // Backswing, then a forward whip: one gesture starts and casts the run.
    await spin(page, [-200, -150, 0, 700, 900, 100]);
    const cast = await readWorld(page);
    expect(cast.fishing.active).toMatchObject({
      mode: 'motion',
      phase: 'waiting',
    });
    expect(cast.cats[0]!.needs.energy).toBe(
      before.cats[0]!.needs.energy - FISHING.cast.staminaCost,
    );
    for (let i = 0; i < 200; i++) {
      if ((await readWorld(page)).fishing.active!.phase === 'hook') break;
      await step(page, 1);
    }
    await expect(page.locator('#motion-bite')).toBeVisible();
    await spin(page, [-400]);
    expect((await readWorld(page)).fishing.active!.phase).toBe('fight');
    await expect(page.locator('#motion-ring')).toBeVisible();
    const plane = (await page.locator('#motion-fishing').boundingBox())!;
    // Motion play gives the river most of the phone: the canvas spans the width
    // and the open-water plane over half of it.
    const canvas = (await page.locator('#game canvas').boundingBox())!;
    expect(canvas.width).toBeGreaterThan(390 * 0.85);
    expect(plane.width).toBeGreaterThan(390 * 0.55);
    let shot = false;
    for (let i = 0; i < 800; i++) {
      const run = (await readWorld(page)).fishing.active;
      if (!run) break;
      const fish = fishPoint(run, run.phaseTick + 1);
      await page.mouse.move(
        plane.x + (fish.x / 100) * plane.width,
        plane.y + (fish.y / 100) * plane.height,
      );
      await step(page, 1);
      if (!shot && run.phaseTick > 20) {
        await expect(page.locator('#motion-ring')).toHaveClass(/inside/);
        await page.screenshot({
          path: testInfo.outputPath('motion-fight.png'),
        });
        shot = true;
      }
    }
    const result = (await readWorld(page)).fishing.lastResult!;
    expect(result.caught).toBe(true);
    await expect(page.locator('#fish-result')).toContainText('钓到了');
    expect(errors).toEqual([]);
  },
);

test('players can switch back to the frozen button flow on this device', async ({
  page,
}) => {
  await inMotionRiver(page);
  await openGear(page, 'supplies');
  await expect(page.locator('#motion-mode-toggle')).toHaveText(/体感 ✓/);
  await page.locator('#motion-mode-toggle').click();
  await expect(page.locator('#motion-mode-toggle')).toHaveText(/按钮/);
  await closeRiverPanel(page);
  await expect(page.locator('#motion-fishing')).toBeHidden();
  await expect(page.locator('#scene-ready')).toBeVisible();
  // The choice is remembered for this device.
  await page.reload();
  await ready(page);
  expect(
    await page.evaluate(() => localStorage.getItem('cat-city.fishing-input')),
  ).toBe('buttons');
});
