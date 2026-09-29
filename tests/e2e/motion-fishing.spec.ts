import { localOrigin, testPorts } from '../../harness/runner/test-ports';
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

async function inMotionRiver(page: Page) {
  // Chromium gates sensors behind permissions; WebKit has no such permission names.
  await page
    .context()
    .grantPermissions(['accelerometer', 'gyroscope'], {
      origin: localOrigin(testPorts().test),
    })
    .catch(() => undefined);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${localOrigin(testPorts().test)}/`);
  await ready(page);
  await enterRiver(page);
  // Desktop browsers default to buttons; opting in asks for sensor permission.
  await openGear(page, 'supplies');
  await page.locator('#motion-mode-toggle').click();
  await closeRiverPanel(page);
  await page.evaluate(() => window.CAT_CITY_DEBUG!.useManualFishingClock(true));
  await sensorsOn(page);
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

/** A quick flick of the tip down: the cast gesture. */
const swing = (page: Page) => spin(page, [0, 300, 700, 900, 100, 0]);
async function toBite(page: Page) {
  for (let i = 0; i < 200; i++) {
    if ((await readWorld(page)).fishing.active!.phase === 'hook') return;
    await step(page, 1);
  }
  throw new Error('No bite');
}

test('the tilt aim survives the city clock refreshing the view', async ({
  page,
}) => {
  await inMotionRiver(page);
  const { aimRangeDeg } = FISHING.motion.gesture;
  await orient(page, -aimRangeDeg, 0);
  // Any session update (the city clock ticks every second) must keep the zero pose.
  await page.evaluate(() => window.CAT_CITY_DEBUG!.advanceTime(1));
  await orient(page, -aimRangeDeg, 0);
  // The water preview follows the tilt before the cast.
  await expect(page.locator('#fish-direction')).toHaveValue(
    String(-FISHING.input.maxDirection),
  );
  await swing(page);
  expect((await readWorld(page)).fishing.active!.direction).toBe(
    -FISHING.input.maxDirection,
  );
});

test('a paused motion run ignores gestures and says how to resume', async ({
  page,
}) => {
  await inMotionRiver(page);
  await swing(page);
  await toBite(page);
  await page.locator('#fish-pause').click();
  await expect(page.locator('#motion-fishing-hint')).toContainText('已暂停');
  await spin(page, [-400]);
  expect((await readWorld(page)).fishing.active!.phase).toBe('hook');
  await page.locator('#fish-pause').click();
  await spin(page, [-400]);
  expect((await readWorld(page)).fishing.active!.phase).toBe('fight');
});

test('tapping the water strikes when a lift cannot be sensed', async ({
  page,
}) => {
  await inMotionRiver(page);
  await swing(page);
  await toBite(page);
  await page.locator('#motion-fishing').click();
  expect((await readWorld(page)).fishing.active!.phase).toBe('fight');
});

test('the fish ring is drawn on a square plane that matches the hit test', async ({
  page,
}) => {
  await inMotionRiver(page);
  const plane = (await page.locator('#motion-fishing').boundingBox())!;
  expect(Math.abs(plane.width - plane.height)).toBeLessThanOrEqual(1);
});

test('a phone without orientation readings can still cast straight ahead', async ({
  page,
}) => {
  await page
    .context()
    .grantPermissions(['accelerometer', 'gyroscope'], {
      origin: localOrigin(testPorts().test),
    })
    .catch(() => undefined);
  await page.goto(`${localOrigin(testPorts().test)}/`);
  await ready(page);
  await enterRiver(page);
  await openGear(page, 'supplies');
  await page.locator('#motion-mode-toggle').click();
  await closeRiverPanel(page);
  await sensorsOn(page, false);
  await swing(page);
  expect((await readWorld(page)).fishing.active).toMatchObject({
    mode: 'motion',
    direction: 0,
  });
});

test('after a reload mid-run, phones are asked to re-enable motion', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context
    .grantPermissions(['accelerometer', 'gyroscope'], {
      origin: localOrigin(testPorts().test),
    })
    .catch(() => undefined);
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

test('one-tap calibration lets a phone with a reversed pitch cast', async ({
  page,
}) => {
  await inMotionRiver(page);
  const flick = [0, 300, 700, 900, 100, 0];
  const quiet = Array<number>(12).fill(0);
  const reversed = (rates: number[]) =>
    spin(
      page,
      rates.map((r) => -r),
    );
  // Before calibrating, the reversed flick is not a cast.
  await reversed(flick);
  expect((await readWorld(page)).fishing.active).toBeNull();
  await page.locator('#motion-calibrate').click();
  await expect(page.locator('#motion-fishing-hint')).toContainText('校准');
  for (const rates of [flick, quiet, flick, quiet]) {
    await reversed(rates);
    // A flick ends after a quiet spell measured in event time, so let time pass.
    await page.waitForTimeout(FISHING.motion.gesture.calibration.quietMs + 50);
  }
  await expect(page.locator('#motion-fishing-hint')).toContainText('校准完成');
  await expect(page.locator('#motion-fishing-hint')).toContainText('下甩 900');
  // Flicks just after calibrating still belong to it; after the settle, one casts.
  await reversed(flick);
  expect((await readWorld(page)).fishing.active).toBeNull();
  await page.waitForTimeout(FISHING.motion.gesture.calibration.settleMs);
  await reversed(flick);
  expect((await readWorld(page)).fishing.active).toMatchObject({
    mode: 'motion',
    phase: 'waiting',
  });
  // The tuning is kept for this device.
  expect(
    await page.evaluate(() => localStorage.getItem('cat-city.rod-tuning.v2')),
  ).toContain('"pitchSign"');
});

test('slow pitch sets the power the flick casts with', async ({
  page,
}, testInfo) => {
  await inMotionRiver(page);
  const { powerRangeDeg } = FISHING.motion.gesture;
  // Tilt the tip back slowly, as far as the power range goes.
  for (let i = 0; i < 30; i++) await orient(page, 0, powerRangeDeg);
  await expect(page.locator('#motion-power')).toHaveAttribute(
    'aria-valuenow',
    '100',
  );
  await page.screenshot({ path: testInfo.outputPath('motion-aim.png') });
  // The cast reads the power from just before the flick: hold the tilt that long, as a
  // player does, or a fast machine flicks within the lead and reads the earlier power.
  await page.waitForTimeout(FISHING.motion.gesture.powerLeadMs * 2);
  await swing(page);
  expect((await readWorld(page)).fishing.active).toMatchObject({
    mode: 'motion',
    power: 100,
  });
});

test('a phone in button mode can switch to motion right from the river', async ({
  page,
}) => {
  await inMotionRiver(page);
  await openGear(page, 'supplies');
  await page.locator('#motion-mode-toggle').click();
  await closeRiverPanel(page);
  await expect(page.locator('#scene-ready')).toBeVisible();
  // No digging in the gear panel: the ready area offers the way back.
  const quick = page.locator('#motion-quick');
  await expect(quick).toHaveText('改用体感钓鱼');
  await quick.click();
  await sensorsOn(page);
  await expect(page.locator('#motion-fishing')).toBeVisible();
  await expect(quick).toBeHidden();
});

test('a phone that has not chosen yet sees the motion card, not the manual cast', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(`${localOrigin(testPorts().test)}/`);
  await ready(page);
  await enterRiver(page);
  await closeRiverPanel(page);
  await expect(page.locator('#motion-onboarding')).toBeVisible();
  await expect(page.locator('#scene-ready')).toBeHidden();
  // Choosing buttons brings the manual cast back.
  await page.locator('#motion-use-buttons').click();
  await expect(page.locator('#scene-ready')).toBeVisible();
  await context.close();
});
