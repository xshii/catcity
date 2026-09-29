import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import { enterRiver } from '../../harness/adapters/catcity/city-input';
import {
  closeRiverPanel,
  openGear,
} from '../../harness/adapters/catcity/navigation';
import { FISHING } from '../../src/content/fishing';
import { fishPoint } from '../../src/minigames/angling-motion';
import { SCREEN_COPY } from '../../src/view/fishing/screen';
import { DEFAULT_TUNING } from '../../src/view/motion/rod';

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
/** Enabling awaits a permission promise; feed still samples until the game hears them. */
async function sensorsOn(page: Page, withOrientation = true) {
  await expect
    .poll(async () => {
      if (withOrientation) await orient(page, 0, 0);
      await spin(page, [0]);
      return page.locator('#motion-mode-toggle').getAttribute('aria-pressed');
    })
    .toBe('true');
}
const step = (page: Page, ticks = 1) =>
  page.evaluate((n) => window.CAT_CITY_DEBUG!.stepFishing(n), ticks);

/** Chromium gates sensors behind permissions; WebKit has no such permission names. */
const grantSensors = (context: BrowserContext) =>
  context
    .grantPermissions(['accelerometer', 'gyroscope'], {
      origin: localOrigin(testPorts().test),
    })
    .catch(() => undefined);
/** A phone: coarse touch pointer at phone size. */
const phoneContext = (browser: Browser) =>
  browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

/**
 * A device that finished the first-cast guide and calibrated before (spec 033 F3), so the
 * tests here drive the rod directly. Written before every load of the page.
 */
const seasoned = (target: Page | BrowserContext) =>
  target.addInitScript((tuning) => {
    localStorage.setItem('cat-city.fishing-guide', 'done');
    localStorage.setItem('cat-city.rod-tuning.v2', tuning);
  }, JSON.stringify(DEFAULT_TUNING));

async function inMotionRiver(
  page: Page,
  { orientation = true, fresh = false } = {},
) {
  await grantSensors(page.context());
  if (!fresh) await seasoned(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${localOrigin(testPorts().test)}/`);
  await ready(page);
  await enterRiver(page);
  // Desktop browsers default to buttons; opting in asks for sensor permission.
  await openGear(page, 'supplies');
  await page.locator('#motion-mode-toggle').click();
  await closeRiverPanel(page);
  await page.evaluate(() => window.CAT_CITY_DEBUG!.useManualFishingClock(true));
  await sensorsOn(page, orientation);
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
    // A quick flick down starts and casts the run.
    await swing(page);
    const cast = await readWorld(page);
    expect(cast.fishing.active).toMatchObject({
      mode: 'motion',
      phase: 'waiting',
    });
    expect(cast.cats[0]!.needs.energy).toBe(
      before.cats[0]!.needs.energy - FISHING.cast.staminaCost,
    );
    await toBite(page);
    await expect(page.locator('#motion-bite')).toBeVisible();
    // The manual clock can bring the bite (sooner on a fish shadow) inside the cooldown
    // that keeps the cast's rebound from striking; a real bite comes long after it.
    await page.waitForTimeout(FISHING.motion.gesture.liftCooldownMs);
    await spin(page, [-400]);
    expect((await readWorld(page)).fishing.active!.phase).toBe('fight');
    await expect(page.locator('#motion-ring')).toBeVisible();
    // Without vibration (WebKit) the strike shakes the river: measure it at rest.
    await expect(page.locator('#fishing-stage')).not.toHaveClass(
      /screen-shake/,
    );
    const plane = (await page.locator('#motion-fishing').boundingBox())!;
    // Motion play gives the river most of the phone: the canvas spans the width
    // and the open-water plane over half of it.
    const canvas = (await page.locator('#game canvas').boundingBox())!;
    expect(canvas.width).toBeGreaterThan(390 * 0.85);
    expect(plane.width).toBeGreaterThan(390 * 0.55);
    let shot = false;
    let checked = 0;
    for (let i = 0; i < 800; i++) {
      const run = (await readWorld(page)).fishing.active;
      if (!run) break;
      // Cover the fish as drawn with the ring; it must sit where Core judges the next tick.
      const fish = (await page.locator('#motion-fish').boundingBox())!;
      const centre = {
        x: fish.x + fish.width / 2,
        y: fish.y + fish.height / 2,
      };
      if (run.phase === 'fight') {
        const judged = fishPoint(run, run.phaseTick + 1);
        expect(centre.x).toBeCloseTo(
          plane.x + (judged.x / 100) * plane.width,
          0,
        );
        expect(centre.y).toBeCloseTo(
          plane.y + (judged.y / 100) * plane.height,
          0,
        );
        checked++;
      }
      await page.mouse.move(centre.x, centre.y);
      await step(page, 1);
      if ((await readWorld(page)).fishing.active?.phase === 'fight') {
        // The ring is the player's: it sits on the rod tip, here the finger.
        const ring = (await page.locator('#motion-ring').boundingBox())!;
        expect(
          Math.abs(ring.x + ring.width / 2 - centre.x),
        ).toBeLessThanOrEqual(plane.width / 100 + 1);
        expect(
          Math.abs(ring.y + ring.height / 2 - centre.y),
        ).toBeLessThanOrEqual(plane.height / 100 + 1);
      }
      if (!shot && run.phaseTick > FISHING.motion.fight.graceTicks) {
        await expect(page.locator('#motion-ring')).toHaveClass(/inside/);
        await page.screenshot({
          path: testInfo.outputPath('motion-fight.png'),
        });
        shot = true;
      }
    }
    expect(checked).toBeGreaterThan(FISHING.motion.fight.graceTicks);
    const result = (await readWorld(page)).fishing.lastResult!;
    expect(result.caught).toBe(true);
    await expect(page.locator('#fish-result')).toContainText('钓到了');
    expect(errors).toEqual([]);
  },
);

/** A quick flick of the tip down: the cast gesture. */
const FLICK = [0, 300, 700, 900, 100, 0];
const swing = (page: Page) => spin(page, FLICK);
async function toBite(page: Page) {
  for (let i = 0; i < 200; i++) {
    if ((await readWorld(page)).fishing.active!.phase === 'hook') return;
    await step(page, 1);
  }
  throw new Error('No bite');
}

test('the fish ring is drawn on a square plane that matches the hit test', async ({
  page,
}) => {
  await inMotionRiver(page);
  const plane = (await page.locator('#motion-fishing').boundingBox())!;
  expect(Math.abs(plane.width - plane.height)).toBeLessThanOrEqual(1);
});

test('after a reload mid-run, phones are asked to re-enable motion', async ({
  browser,
}) => {
  const context = await phoneContext(browser);
  await grantSensors(context);
  await seasoned(context);
  const page = await context.newPage();
  await page.goto(`${localOrigin(testPorts().test)}/`);
  await ready(page);
  await enterRiver(page);
  await closeRiverPanel(page);
  await expect(page.locator('#motion-onboarding')).toBeVisible();
  await page.locator('#motion-enable').click();
  await sensorsOn(page);
  await swing(page);
  expect((await readWorld(page)).fishing.active!.mode).toBe('motion');
  await page.reload();
  await ready(page);
  // Sensors need a new tap after a reload; the card must return for the live run.
  await expect(page.locator('#motion-onboarding')).toBeVisible();
  await context.close();
});

test(
  'a first motion cast calibrates by itself, then is taught one step at a time',
  { tag: '@motion-smoke' },
  async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await inMotionRiver(page, { fresh: true });
    const hint = page.locator('#motion-fishing-hint');
    const skip = page.locator('#motion-guide-skip');
    // Never calibrated: aiming starts calibration without looking for the button.
    await expect(hint).toHaveText(SCREEN_COPY.hint.calibrating);
    await expect(page.locator('#motion-calibrate')).toBeHidden();
    // No flicks: it fails, says to use the button, and the guide carries on.
    await expect(hint).toHaveText(SCREEN_COPY.calibrate.failed, {
      timeout: FISHING.motion.gesture.calibration.windowMs + 5000,
    });
    await expect(page.locator('#motion-calibrate')).toBeVisible();
    await expect(hint).toHaveText(SCREEN_COPY.guide.aim);
    await expect(skip).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('motion-guide.png') });
    // Each step's hint shows until the player makes that move.
    const { aimRangeDeg, powerRangeDeg } = FISHING.motion.gesture;
    await orient(page, -aimRangeDeg, 0);
    await expect(hint).toHaveText(SCREEN_COPY.guide.power);
    for (let i = 0; i < 30; i++)
      await orient(page, -aimRangeDeg, powerRangeDeg);
    await expect(hint).toHaveText(SCREEN_COPY.guide.cast);
    await page.waitForTimeout(FISHING.motion.gesture.powerLeadMs * 2);
    await swing(page);
    expect((await readWorld(page)).fishing.active!.phase).toBe('waiting');
    await expect(hint).toHaveText(SCREEN_COPY.guide.strike);
    await toBite(page);
    await expect(hint).toHaveText(SCREEN_COPY.guide.strike);
    await spin(page, [-400]);
    expect((await readWorld(page)).fishing.active!.phase).toBe('fight');
    await expect(hint).toHaveText(SCREEN_COPY.guide.fight);
    // Cover the fish until Core counts the hold: the guide is done, for this device.
    for (let i = 0; i < 200; i++) {
      const run = (await readWorld(page)).fishing.active;
      if (run?.phase !== 'fight' || (await skip.isHidden())) break;
      const fish = (await page.locator('#motion-fish').boundingBox())!;
      await page.mouse.move(fish.x + fish.width / 2, fish.y + fish.height / 2);
      await step(page, 1);
    }
    await expect(skip).toBeHidden();
    await expect(hint).not.toHaveText(SCREEN_COPY.guide.fight);
    expect(
      await page.evaluate(() => localStorage.getItem('cat-city.fishing-guide')),
    ).toBe('done');
    expect(errors).toEqual([]);
  },
);
