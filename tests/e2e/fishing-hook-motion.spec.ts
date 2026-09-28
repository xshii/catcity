import { expect, test, type Page } from '@playwright/test';
import {
  catchFish,
  fishingClock,
  reelIn,
} from '../../harness/adapters/catcity/angling-input';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import { reachWaterway } from '../../harness/adapters/catcity/city-input';

async function sensors(page: Page) {
  await page.addInitScript(() => {
    for (const name of ['DeviceOrientationEvent', 'DeviceMotionEvent']) {
      const api = class extends Event {};
      Object.assign(api, {
        requestPermission: () => Promise.resolve('granted'),
      });
      Object.defineProperty(window, name, { configurable: true, value: api });
    }
  });
}

async function tilt(page: Page, gamma: number, beta: number) {
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

async function flick(page: Page, z: number) {
  await page.evaluate((value) => {
    const event = new Event('devicemotion');
    Object.defineProperty(event, 'acceleration', {
      value: { x: 0, y: 0, z: value },
    });
    window.dispatchEvent(event);
  }, z);
}

async function startAtShore(page: Page) {
  await sensors(page);
  await page.goto('/');
  await ready(page);
  await reachWaterway(page);
  await page.locator('#begin-fishing').click();
  // Hook timing is asserted tick by tick; the test owns the fishing clock.
  await fishingClock(page);
  await page.locator('#motion-quick-toggle').click();
  await tilt(page, 0, 0);
  await flick(page, 0);
}

/** Step fishing ticks until the run reaches `phase`. */
async function step(page: Page, phase: string, maxTicks: number) {
  const clock = await fishingClock(page);
  await clock.until(
    async () => (await readWorld(page)).fishing.active?.phase === phase,
    maxTicks,
  );
}

async function ticks(page: Page, count: number) {
  await (await fishingClock(page)).advance(count);
}

async function castToPausedHook(page: Page) {
  await page.locator('#cast-start').click();
  await expect(page.locator('#motion-cast-arm')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await flick(page, 0);
  await flick(page, -10);
  // The flick casts on its own sensor timer; waiting ticks then pass by step.
  await expect
    .poll(async () => (await readWorld(page)).fishing.active?.phase)
    .toBe('waiting');
  await step(page, 'hook', 100);
  await page.locator('#fish-pause').click();
  await expect(page.locator('#fish-pause')).toHaveText('继续钓鱼');
}

const hookPoint = (page: Page) =>
  page.locator('#motion-hook-dot').evaluate((element) => ({
    x: Number.parseFloat(element.style.left),
    y: Number.parseFloat(element.style.top),
  }));

async function finishFight(page: Page) {
  const control = page.locator('#fish-control');
  await expect(control).toBeInViewport({ ratio: 1 });
  if ((await page.locator('#fish-pause').textContent()) === '继续钓鱼')
    await page.locator('#fish-pause').click();
  await control.focus();
  let held = false;
  const hold = async (next: boolean) => {
    if (next === held) return;
    if (next) await page.keyboard.down('Space');
    else await page.keyboard.up('Space');
    held = next;
  };
  try {
    await reelIn(page, await fishingClock(page), hold);
  } finally {
    await hold(false);
  }
}

for (const viewport of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
])
  test(
    `tilting into the hook circle catches a fish without changing scene geometry at ${viewport.width}px`,
    { tag: '@motion-smoke' },
    async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await startAtShore(page);
      const canvas = await page.locator('canvas').boundingBox();
      await castToPausedHook(page);
      await page.locator('#fish-pause').click();
      await ticks(page, 8);
      await page.locator('#fish-pause').click();
      const paused = await readWorld(page);
      expect(paused.fishing.active!.phase).toBe('hook');
      await expect(page.locator('#motion-hook-guide')).toBeVisible();
      await expect(page.locator('#motion-hook-pad')).toBeInViewport({
        ratio: 1,
      });
      await expect(page.locator('#fish-control')).toBeInViewport({ ratio: 1 });
      expect(await hookPoint(page)).toEqual({ x: 80, y: 20 });
      await expect(page.locator('#motion-hook-status')).toContainText('已暂停');
      await expect(page.locator('#motion-hook-pad')).toHaveAccessibleName(
        /圈外/,
      );
      await expect(page.locator('#motion-hook-progress')).toHaveJSProperty(
        'value',
        0,
      );
      const pad = await page.locator('#motion-hook-pad').boundingBox();
      expect(Math.abs(pad!.width - pad!.height)).toBeLessThan(1);
      // Calibration changes the reference pose, never this run or its locked cast.
      await page.locator('#motion-quick-calibrate').click();
      await tilt(page, 0, 0);
      expect(await hookPoint(page)).toEqual({ x: 80, y: 20 });
      expect(await readWorld(page)).toEqual(paused);
      await page.screenshot({
        path: testInfo.outputPath('hook-circle-outside.png'),
      });
      await tilt(page, -23, 23);
      const aligned = await hookPoint(page);
      expect(Math.abs(aligned.x - 50)).toBeLessThanOrEqual(5);
      expect(Math.abs(aligned.y - 50)).toBeLessThanOrEqual(5);
      await expect(page.locator('#motion-hook-pad')).toHaveAccessibleName(
        /圈内/,
      );
      expect(await readWorld(page)).toEqual(paused);
      await page.screenshot({
        path: testInfo.outputPath('hook-circle-aligned.png'),
      });
      await page.locator('#fish-pause').click();
      await step(page, 'fight', 40);
      await page.locator('#fish-pause').click();
      await expect(page.locator('#motion-hook-guide')).toBeHidden();
      const fought = await readWorld(page);
      expect(fought.cats[0]!.needs.energy).toBe(paused.cats[0]!.needs.energy);
      expect(fought.fishing.baits).toEqual(paused.fishing.baits);
      expect(fought.fishing.active!.direction).toBe(
        paused.fishing.active!.direction,
      );
      expect(fought.fishing.active!.aimDepth).toBe(
        paused.fishing.active!.aimDepth,
      );
      const trace = await page.evaluate(() =>
        window.CAT_CITY_DEBUG!.getReplay(),
      );
      const motionTicks = trace.entries.filter(
        (entry) => entry.command.type === 'FISH_MOTION_CONTROL',
      );
      expect(motionTicks.length).toBeGreaterThanOrEqual(6);
      expect(motionTicks.every((entry) => entry.result.ok)).toBe(true);
      const after = await page.locator('canvas').boundingBox();
      for (const field of ['x', 'y', 'width', 'height'] as const)
        expect(Math.abs(after![field] - canvas![field])).toBeLessThan(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight),
      ).toBeLessThanOrEqual(viewport.height);
      await finishFight(page);
      expect((await readWorld(page)).fishing.inventory).toHaveLength(1);
      expect(errors).toEqual([]);
    },
  );

test('turning off motion at the hook circle preserves the run and permits a full manual catch', async ({
  page,
}) => {
  await startAtShore(page);
  await castToPausedHook(page);
  await expect(page.locator('#motion-hook-guide')).toBeVisible();
  const paused = await readWorld(page);
  await page.locator('#motion-quick-toggle').click();
  await expect(page.locator('#motion-hook-guide')).toBeHidden();
  await tilt(page, -23, 23);
  expect(await readWorld(page)).toEqual(paused);
  await expect(page.locator('#fish-control')).toBeEnabled();
  await page.locator('#fish-pause').click();
  await catchFish(page);
  const after = await readWorld(page);
  expect(after.fishing.inventory).toHaveLength(1);
  expect(after.cats[0]!.needs.energy).toBe(paused.cats[0]!.needs.energy);
});

test('the manual hook button takes over from the circle for the rest of the phase', async ({
  page,
}) => {
  await startAtShore(page);
  await castToPausedHook(page);
  await expect(page.locator('#motion-hook-guide')).toBeVisible();
  await tilt(page, -23, 23);
  await page.locator('#fish-pause').click();
  // Fewer stable ticks than any fish needs (6 + 2 × stars), so the hook stays open.
  await ticks(page, 2);
  await page.locator('#fish-pause').click();
  const paused = await readWorld(page);
  expect(paused.fishing.active!.phase).toBe('hook');
  expect(paused.fishing.active!.motionStableTicks).toBeGreaterThan(0);
  await expect(page.locator('#fish-control')).toContainText('切回按钮提竿');
  // First press reveals the manual meter; it must not blindly strike at a
  // previously hidden cursor or silently resume a paused attempt.
  await page.locator('#fish-control').press('Space');
  await expect(page.locator('#motion-hook-guide')).toBeHidden();
  await expect(page.locator('#angling-bar')).toBeVisible();
  await expect(page.locator('#fish-pause')).toHaveText('继续钓鱼');
  expect(await readWorld(page)).toEqual(paused);
  const manualTraceStart = await page.evaluate(
    () => window.CAT_CITY_DEBUG!.getReplay().entries.length,
  );
  await page.locator('#fish-pause').click();
  await catchFish(page, 'keyboard', async (phase) => {
    if (phase === 'hook') {
      // One manual-control tick clears the circle's stable count.
      await ticks(page, 1);
      await expect
        .poll(
          async () => (await readWorld(page)).fishing.active?.motionStableTicks,
          { intervals: [10] },
        )
        .toBe(0);
    }
    if (phase !== 'fight') return;
    await expect(page.locator('#motion-hook-guide')).toBeHidden();
    await expect(page.locator('#motion-quick-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await tilt(page, -23, 23);
  });
  const entries = await page.evaluate(
    () => window.CAT_CITY_DEBUG!.getReplay().entries,
  );
  expect(manualTraceStart).toBeGreaterThan(0);
  expect(
    entries
      .slice(manualTraceStart)
      .some((entry) => entry.command.type === 'FISH_MOTION_CONTROL'),
  ).toBe(false);
  expect((await readWorld(page)).fishing.inventory).toHaveLength(1);
});
