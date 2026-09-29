import { CARE } from '../../src/content/care';
import { enterRiver } from '../../harness/adapters/catcity/city-input';
import { expect, test } from '@playwright/test';
import { FISHING } from '../../src/content/fishing';
import { WATER_VIEW, waterPoint } from '../../src/view/art/water-view';
import {
  castOnce,
  catchFish,
  fishingClock,
} from '../../harness/adapters/catcity/angling-input';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import {
  closeRiverPanel,
  openCats,
  openGear,
} from '../../harness/adapters/catcity/navigation';

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
  // Nothing to press: an idle, tired cat shows that it is recovering.
  await openCats(page);
  await expect(page.locator('[data-cat-id="mochi"]')).toHaveAccessibleName(
    /在休息/,
  );
  await page.locator('#invite-pepper').click();
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

test('browsers without vibration shake the river on a bite instead and do not change gameplay', async ({
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
  await expect(page.locator('#haptics-toggle')).toBeEnabled();
  await expect(page.locator('#haptics-toggle')).toHaveText('画面反馈：开');
  await closeRiverPanel(page);
  const before = await readWorld(page);
  await page.locator('#cast-start').click();
  await expect(page.locator('#fish-control')).toBeVisible();
  // Preparing is free; stamina is paid when the cast is released.
  expect((await readWorld(page)).cats[0]!.needs.energy).toBe(
    before.cats[0]!.needs.energy,
  );
  await castOnce(page);
  // Step to the bite and read the stage in the same page task: no timing involved.
  const clock = await fishingClock(page);
  const shaken = await page.evaluate(() => {
    const bridge = window.CAT_CITY_DEBUG!;
    for (let tick = 0; tick < 1000; tick++) {
      bridge.stepFishing(1);
      if (bridge.getWorldState().fishing.active?.phase === 'hook')
        return document
          .querySelector('#fishing-stage')!
          .classList.contains('screen-shake');
    }
    return null;
  });
  await clock.release();
  expect(shaken).toBe(true);
  expect(errors).toEqual([]);
});

test('sound starts with the first gesture, a cast plays it, and switching it off is remembered', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // A stand-in Web Audio that counts contexts and started sounds.
  await page.addInitScript(() => {
    const stats = { contexts: 0, starts: 0 };
    const param = () => ({
      value: 0,
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
      setTargetAtTime() {},
    });
    const node = () => ({
      gain: param(),
      frequency: param(),
      type: '',
      buffer: null,
      connect: (next: unknown) => next,
      start: () => stats.starts++,
      stop() {},
    });
    class StubAudioContext {
      currentTime = 0;
      sampleRate = 8000;
      state = 'running';
      destination = node();
      constructor() {
        stats.contexts++;
      }
      createGain = node;
      createOscillator = node;
      createBiquadFilter = node;
      createBufferSource = node;
      createBuffer = (_channels: number, length: number) => ({
        getChannelData: () => new Float32Array(length),
      });
      resume = () => Promise.resolve();
      suspend = () => Promise.resolve();
    }
    Object.assign(window, {
      AudioContext: StubAudioContext,
      soundStats: stats,
    });
  });
  const stats = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            soundStats: { contexts: number; starts: number };
          }
        ).soundStats,
    );
  await page.goto('/');
  await ready(page);
  expect(await stats()).toEqual({ contexts: 0, starts: 0 });
  await enterRiver(page);
  await openGear(page, 'supplies');
  await expect(page.locator('#sound-toggle')).toHaveText('音效：开');
  await closeRiverPanel(page);
  expect(await stats()).toEqual({ contexts: 1, starts: 0 });
  await page.locator('#cast-start').click();
  await castOnce(page);
  await expect.poll(async () => (await stats()).starts).toBeGreaterThan(0);

  await openGear(page, 'supplies');
  await page.locator('#sound-toggle').click();
  await expect(page.locator('#sound-toggle')).toHaveText('音效：关');
  await expect(page.locator('#sound-toggle')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.reload();
  await ready(page);
  await openGear(page, 'supplies');
  await expect(page.locator('#sound-toggle')).toHaveText('音效：关');
  // Gestures no longer start any audio while sound is off.
  expect(await stats()).toEqual({ contexts: 0, starts: 0 });
  expect(errors).toEqual([]);
});

test('city clock updates preserve the focused cat card and render fixture names literally', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  await enterRiver(page);
  // The roster lives in the cats panel; the city clock still runs while it is open.
  await openCats(page);
  const card = page.locator('[data-cat-id="mochi"]');
  const mounted = await card.elementHandle();
  await card.focus();
  await page.evaluate(() => window.CAT_CITY_DEBUG!.advanceTime(1));
  await expect(card).toBeFocused();
  expect(await mounted.evaluate((element) => element.isConnected)).toBe(true);
  // A pond-shore spawn arrives at full energy; spend a cast so it has something to recover.
  await closeRiverPanel(page);
  await page.locator('#cast-start').click();
  await castOnce(page);
  await page.locator('#fish-cancel').click();
  const tired = (await readWorld(page)).cats[0]!.needs.energy;
  expect(tired).toBeLessThan(100);
  await openCats(page);
  await card.focus();
  await page.evaluate(() => window.CAT_CITY_DEBUG!.advanceTime(10));
  await expect(card).toBeFocused();
  await expect(card).toHaveAccessibleName(/在休息/);
  await expect(card.locator('progress')).toHaveJSProperty(
    'value',
    tired + CARE.recovery.idle,
  );
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

test('leaving the river gives up an uncast rod, but keeps a cast one to come back to', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  await enterRiver(page);
  const arrival = await readWorld(page);
  await page.locator('#cast-start').click();
  expect((await readWorld(page)).fishing.active?.phase).toBe('charge');
  await page.locator('#visit-city').click();
  // Nothing was paid, and the cat is free to recover.
  const left = await readWorld(page);
  expect(left.fishing.active).toBeNull();
  expect(left.cats[0]!.needs.energy).toBe(arrival.cats[0]!.needs.energy);
  await enterRiver(page);
  await page.locator('#cast-start').click();
  await castOnce(page);
  await page.locator('#visit-city').click();
  expect((await readWorld(page)).fishing.active?.phase).not.toBe('charge');
  expect((await readWorld(page)).fishing.active).not.toBeNull();
});
