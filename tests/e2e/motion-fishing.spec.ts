import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import { reachWaterway } from '../../harness/adapters/catcity/city-input';
import { FISHING } from '../../src/content/fishing';
import { fishPoint } from '../../src/minigames/angling-motion';
import { SCREEN_COPY } from '../../src/view/fishing/screen';
import {
  ASKED_IN_GESTURE,
  askForSensors,
  orient,
  phoneContext,
  seasoned,
  sensorAsks,
  sensorsOn,
  spin,
} from '../helpers/motion-phone';

const step = (page: Page, ticks = 1) =>
  page.evaluate((n) => window.CAT_CITY_DEBUG!.stepFishing(n), ticks);

/**
 * A phone that must ask for its sensors (as iOS does) walks to the pond and taps
 * 「进入钓点」: motion is the default (spec 034), so that very tap asks for both sensors,
 * inside the gesture, with no card in between; then the sensors report.
 */
async function inMotionRiver(
  browser: Browser,
  { orientation = true, fresh = false } = {},
) {
  const context = await phoneContext(browser);
  await askForSensors(context);
  if (!fresh) await seasoned(context);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${localOrigin(testPorts().test)}/`);
  await ready(page);
  await reachWaterway(page);
  expect(await sensorAsks(page)).toEqual([]);
  await page.locator('#begin-fishing').tap();
  await expect(page.locator('#visit-river')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect.poll(() => sensorAsks(page)).toEqual(ASKED_IN_GESTURE);
  await page.evaluate(() => window.CAT_CITY_DEBUG!.useManualFishingClock(true));
  await sensorsOn(page, orientation);
  await expect(page.locator('#motion-fishing')).toBeVisible();
  await expect(page.locator('#scene-ready')).toBeHidden();
  return { page, context, errors };
}

test(
  'a swing casts, "!" asks for a lift, and following the fish ring lands it',
  { tag: '@motion-smoke' },
  async ({ browser }, testInfo) => {
    const { page, context, errors } = await inMotionRiver(browser);
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
    await context.close();
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
  browser,
}) => {
  const { page, context } = await inMotionRiver(browser);
  const plane = (await page.locator('#motion-fishing').boundingBox())!;
  expect(Math.abs(plane.width - plane.height)).toBeLessThanOrEqual(1);
  await context.close();
});

test('during a motion run the gear takes its own taps: the settings open and nothing strikes', async ({
  browser,
}) => {
  const { page, context } = await inMotionRiver(browser);
  await swing(page);
  await toBite(page);
  // The water around the gear takes taps as strikes now; the gear is over it.
  await page.locator('#river-settings').tap({ timeout: 5000 });
  await expect(page.locator('#river-settings-sheet')).toBeVisible();
  expect((await readWorld(page)).fishing.active!.phase).toBe('hook');
  await context.close();
});

test('after a reload mid-run, the first tap on the river asks for the sensors again', async ({
  browser,
}) => {
  const { page, context } = await inMotionRiver(browser);
  await swing(page);
  expect((await readWorld(page)).fishing.active!.mode).toBe('motion');
  await page.reload();
  await ready(page);
  // The restored run brings back the river without a tap: nothing is asked yet.
  await expect(page.locator('#motion-fishing')).toBeVisible();
  expect(await sensorAsks(page)).toEqual([]);
  // A tap on the water asks, inside it, once; the paused run is not struck.
  await page.locator('#motion-fishing').tap();
  await expect.poll(() => sensorAsks(page)).toEqual(ASKED_IN_GESTURE);
  expect((await readWorld(page)).fishing.active!.phase).toBe('waiting');
  await context.close();
});

test(
  'a first motion cast calibrates by itself, then is taught one step at a time',
  { tag: '@motion-smoke' },
  async ({ browser }, testInfo) => {
    const { page, context, errors } = await inMotionRiver(browser, {
      fresh: true,
    });
    const hint = page.locator('#motion-fishing-hint');
    const skip = page.locator('#motion-guide-skip');
    const calibrate = page.locator('#settings-calibrate');
    // Never calibrated: aiming starts calibration without looking for it in the settings.
    await expect(hint).toHaveText(SCREEN_COPY.hint.calibrating);
    await expect(calibrate).toHaveJSProperty('hidden', true);
    // No flicks: it fails, says where to calibrate, and the guide carries on.
    await expect(hint).toHaveText(SCREEN_COPY.calibrate.failed, {
      timeout: FISHING.motion.gesture.calibration.windowMs + 5000,
    });
    await expect(page.locator('#river-settings')).toBeVisible();
    await expect(calibrate).toHaveJSProperty('hidden', false);
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
    await context.close();
  },
);
