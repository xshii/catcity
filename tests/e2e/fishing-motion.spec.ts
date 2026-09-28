import { catchFish } from '../../harness/adapters/catcity/angling-input';
import { expect, test, type Page } from '@playwright/test';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import { reachWaterway } from '../../harness/adapters/catcity/city-input';
import {
  closeRiverPanel,
  openChat,
  openGear,
} from '../../harness/adapters/catcity/navigation';

type SensorMode =
  | 'granted'
  | 'denied'
  | 'error'
  | 'unsupported'
  | 'http'
  | 'implicit'
  | 'aim-only'
  | 'flick-only';
async function mockSensor(page: Page, mode: SensorMode = 'granted') {
  await page.addInitScript((choice) => {
    const calls: boolean[] = [];
    Object.assign(window, { motionPermissionCalls: calls });
    if (choice === 'http')
      Object.defineProperty(window, 'isSecureContext', {
        configurable: true,
        value: false,
      });
    for (const key of ['DeviceOrientationEvent', 'DeviceMotionEvent']) {
      const api = class extends Event {};
      if (choice !== 'implicit')
        Object.assign(api, {
          requestPermission: () => {
            calls.push(navigator.userActivation.isActive);
            if (choice === 'error') throw new Error('Sensor unavailable');
            const denied =
              choice === 'denied' ||
              (choice === 'aim-only' && key === 'DeviceMotionEvent') ||
              (choice === 'flick-only' && key === 'DeviceOrientationEvent');
            return Promise.resolve(denied ? 'denied' : 'granted');
          },
        });
      Object.defineProperty(window, key, {
        configurable: true,
        value: choice === 'unsupported' ? undefined : api,
      });
    }
  }, mode);
}
async function sensor(page: Page, mode: SensorMode = 'granted') {
  await mockSensor(page, mode);
  await page.goto('/');
  await ready(page);
  await openGear(page, 'supplies');
}
async function accelerate(page: Page, z: number, x = 0, y = 0) {
  await page.evaluate(
    (acceleration) => {
      const event = new Event('devicemotion');
      Object.defineProperty(event, 'acceleration', { value: acceleration });
      window.dispatchEvent(event);
    },
    { x, y, z },
  );
}

async function tilt(page: Page, gamma: number | null, beta: number | null = 0) {
  await page.evaluate(
    ({ x, y }) => {
      const event = new Event('deviceorientation');
      Object.defineProperties(event, {
        gamma: { value: x },
        beta: { value: y },
      });
      window.dispatchEvent(event);
    },
    { x: gamma, y: beta },
  );
}
const calls = (page: Page) =>
  page.evaluate(
    () =>
      (window as typeof window & { motionPermissionCalls: boolean[] })
        .motionPermissionCalls,
  );

test(
  'the real shore and invitation entries allow motion aiming before one paid cast',
  { tag: '@motion-smoke' },
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockSensor(page);
    await page.goto('/');
    await ready(page);
    await reachWaterway(page);
    const arrived = await readWorld(page);
    await page.locator('#begin-fishing').click();
    expect((await readWorld(page)).fishing.active).toBeNull();
    expect(await readWorld(page)).toEqual(arrived);
    await expect(page.locator('#cast-start')).toBeVisible();
    await page.locator('#visit-city').click();
    await openChat(page);
    await page.locator('#fishing').click();
    await expect(page.locator('#visit-river')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await readWorld(page)).toEqual(arrived);
    await expect(page.locator('#cast-start')).toBeVisible();
    await openGear(page);
    await page.locator('#fish-bait').selectOption('WORM');
    await closeRiverPanel(page);
    await page.locator('#motion-quick-toggle').click();
    await tilt(page, 0);
    await accelerate(page, 0);
    await tilt(page, 20, 20);
    await expect(page.locator('#motion-guide-title')).toHaveText('体感瞄准');
    await expect(page.locator('#fish-direction')).toHaveValue('-5');
    await expect(page.locator('#fish-depth')).toHaveValue('75');
    await expect(page.locator('#motion-aim-value')).toContainText(/左.*5/);
    expect(await readWorld(page)).toEqual(arrived);
    await page.locator('#cast-start').click();
    const charging = await readWorld(page);
    expect(charging.fishing.active).toMatchObject({
      phase: 'charge',
      direction: -5,
      aimDepth: 75,
      baitId: 'WORM',
    });
    expect(charging.cats[0]!.needs.energy).toBe(
      arrived.cats[0]!.needs.energy - 8,
    );
    expect(charging.fishing.baits.WORM).toBe(arrived.fishing.baits.WORM - 1);
    await expect(page.locator('#motion-cast-arm')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await accelerate(page, 0);
    await accelerate(page, -6);
    await expect
      .poll(async () => (await readWorld(page)).fishing.active!.phase)
      .not.toBe('charge');
    const thrown = await readWorld(page);
    expect(thrown.fishing.active!.id).toBe(charging.fishing.active!.id);
    expect(thrown.fishing.active!.power).toBeGreaterThan(0);
    expect(thrown.cats[0]!.needs.energy).toBe(charging.cats[0]!.needs.energy);
    expect(thrown.fishing.baits).toEqual(charging.fishing.baits);
    const castCommands = await page.evaluate(() =>
      window
        .CAT_CITY_DEBUG!.getReplay()
        .entries.filter(
          (entry) =>
            entry.command.type === 'FISH_BEGIN' ||
            entry.command.type === 'FISH_CAST',
        )
        .map((entry) => ({ type: entry.command.type, ok: entry.result.ok })),
    );
    expect(castCommands).toEqual([
      { type: 'FISH_BEGIN', ok: true },
      { type: 'FISH_CAST', ok: true },
    ]);
    await page.locator('#fish-cancel').click();
  },
);

for (const viewport of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
])
  test(
    `scene calibration recenters preview and cancels a pending flick at ${viewport.width}px`,
    { tag: '@motion-smoke' },
    async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await mockSensor(page);
      await page.goto('/');
      await ready(page);
      await reachWaterway(page);
      await page.locator('#begin-fishing').click();
      const before = await readWorld(page);
      const canvas = page.locator('canvas');
      const original = (await canvas.boundingBox())!;
      const quick = page.locator('#motion-quick-calibrate');
      const aim = async () => ({
        direction: await page.locator('#fish-direction').inputValue(),
        depth: await page.locator('#fish-depth').inputValue(),
      });
      const expectCenteredDot = async () =>
        expect(
          await page.locator('#motion-aim-dot').evaluate((element) => ({
            left: element.style.left,
            top: element.style.top,
          })),
        ).toEqual({ left: '50%', top: '50%' });
      await page.locator('#motion-quick-toggle').click();
      await expect(quick).toHaveAttribute('aria-label', '重新校准体感');
      await expect(quick).toBeDisabled();
      await tilt(page, 0);
      await accelerate(page, 0);
      await expect(quick).toBeEnabled();
      await expect(quick).toBeInViewport({ ratio: 1 });
      const buttonBounds = (await quick.boundingBox())!;
      expect(buttonBounds.height).toBeGreaterThanOrEqual(44);
      expect(buttonBounds.width).toBeGreaterThanOrEqual(44);
      await tilt(page, 20, 20);
      const first = await aim();
      const center = { direction: '0', depth: '50' };
      expect(first).not.toEqual(center);
      await quick.click();
      expect(await aim()).toEqual(center);
      await expectCenteredDot();
      await tilt(page, 20, 20);
      expect(await aim()).toEqual(center);
      await tilt(page, 30, 30);
      const second = await aim();
      expect(second).toEqual({ direction: '10', depth: '60' });
      await quick.click();
      await tilt(page, 30, 30);
      expect(await aim()).toEqual(center);
      await expectCenteredDot();
      await tilt(page, 20, 20);
      const moved = { direction: '-10', depth: '40' };
      expect(await aim()).toEqual(moved);
      expect(await readWorld(page)).toEqual(before);
      await page.evaluate(() => {
        if (screen.orientation) {
          Object.defineProperty(screen.orientation, 'angle', {
            configurable: true,
            value: 90,
          });
          screen.orientation.dispatchEvent(new Event('change'));
        } else {
          Object.defineProperty(window, 'orientation', {
            configurable: true,
            value: 90,
          });
          window.dispatchEvent(new Event('orientationchange'));
        }
      });
      await expect(quick).toBeDisabled();
      await expect(page.locator('#motion-guide-title')).toContainText('校准');
      await tilt(page, 0, 20);
      expect(await aim()).toEqual(moved);
      await quick.click();
      await tilt(page, 0, 20);
      expect(await aim()).toEqual(center);
      await expectCenteredDot();
      await page.screenshot({
        path: testInfo.outputPath('scene-calibrated.png'),
      });
      await tilt(page, 0, 10);
      expect(await aim()).toEqual({ direction: '10', depth: '50' });
      expect(await readWorld(page)).toEqual(before);
      await page.locator('#cast-start').click();
      const charged = await readWorld(page);
      const lockedAim = await aim();
      const arm = page.locator('#motion-cast-arm');
      await expect(arm).toHaveAttribute('aria-pressed', 'true');
      // Sensor samples arrive during the real pointer gesture. Calibration must
      // cancel the already scheduled peak, not merely change the button label.
      await quick.evaluate((button) =>
        button.addEventListener(
          'pointerdown',
          () => {
            for (const z of [0, -6]) {
              const event = new Event('devicemotion');
              Object.defineProperty(event, 'acceleration', {
                value: { x: 0, y: 0, z },
              });
              window.dispatchEvent(event);
            }
          },
          { once: true },
        ),
      );
      await quick.click();
      await expect(arm).toHaveAttribute('aria-pressed', 'false');
      expect(await aim()).toEqual(lockedAim);
      await page.waitForTimeout(350);
      expect(await readWorld(page)).toEqual(charged);
      expect(
        await page.evaluate(() =>
          window
            .CAT_CITY_DEBUG!.getReplay()
            .entries.filter((entry) => entry.command.type === 'FISH_CAST'),
        ),
      ).toEqual([]);
      await openGear(page, 'supplies');
      await closeRiverPanel(page);
      await expect(arm).toHaveAttribute('aria-pressed', 'false');
      await arm.click();
      await expect(arm).toHaveAttribute('aria-pressed', 'true');
      await quick.click();
      await expect(arm).toHaveAttribute('aria-pressed', 'false');
      expect(await readWorld(page)).toEqual(charged);
      await page.screenshot({
        path: testInfo.outputPath('calibration-cancels-cast.png'),
      });
      const current = (await canvas.boundingBox())!;
      for (const key of ['x', 'y', 'width', 'height'] as const)
        expect(
          Math.abs(current[key] - original[key]),
          `canvas ${key}`,
        ).toBeLessThan(1);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollHeight <= innerHeight &&
            document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.locator('#fish-cancel').click();
    },
  );

for (const viewport of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
])
  test(`motion mode visibly guides aiming and casting without moving the scene at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize(viewport);
    await sensor(page);
    await closeRiverPanel(page);
    const guide = page.locator('#motion-guide');
    const title = page.locator('#motion-guide-title');
    const before = await readWorld(page);
    const canvas = page.locator('canvas');
    const initialCanvas = (await canvas.boundingBox())!;
    const fixedScene = async () => {
      const bounds = (await canvas.boundingBox())!;
      for (const key of ['x', 'y', 'width', 'height'] as const)
        expect(
          Math.abs(bounds[key] - initialCanvas[key]),
          `canvas ${key}`,
        ).toBeLessThan(1);
      const documentSize = await page.evaluate(() => ({
        height: document.documentElement.scrollHeight,
        width: document.documentElement.scrollWidth,
      }));
      expect(documentSize.height).toBeLessThanOrEqual(viewport.height);
      expect(documentSize.width).toBeLessThanOrEqual(viewport.width);
    };
    const dotPosition = () =>
      page.locator('#motion-aim-dot').evaluate((element) => {
        const style = getComputedStyle(element);
        return { left: style.left, top: style.top };
      });
    await expect(guide).toBeHidden();
    await page.locator('#motion-quick-toggle').click();
    await expect(guide).toBeVisible();
    await expect(title).toHaveText('体感连接中');
    await expect(guide).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#cast-start')).toBeInViewport({ ratio: 1 });
    await fixedScene();
    await tilt(page, 0);
    await accelerate(page, 0);
    await expect(title).toHaveText('体感瞄准');
    const initialDot = await dotPosition();
    await tilt(page, 20, 20);
    const movedDot = await dotPosition();
    expect(movedDot.left).not.toBe(initialDot.left);
    expect(movedDot.top).not.toBe(initialDot.top);
    await expect(page.locator('#motion-aim-value')).toContainText(/左.*5/);
    await expect(page.locator('#motion-aim-value')).toContainText(
      /75.*(远|近)|(远|近).*75/,
    );
    expect(await readWorld(page)).toEqual(before);
    await page.evaluate(() => window.CAT_CITY_DEBUG!.advanceTime(1));
    await expect(title).toHaveText('体感瞄准');
    await expect(page.locator('#cast-start')).toContainText('准备');
    await page.screenshot({ path: testInfo.outputPath('motion-aim.png') });
    await openGear(page, 'supplies');
    await expect(guide).toBeHidden();
    await closeRiverPanel(page);
    await expect(title).toHaveText('体感瞄准');
    await page.locator('#cast-start').click();
    await expect(title).toHaveText('体感甩竿');
    await expect(guide).toContainText('落点锁定');
    const arm = page.locator('#motion-cast-arm');
    await expect(arm).toBeInViewport({ ratio: 1 });
    expect((await arm.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('#fish-control')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#fish-control')).toBeEnabled();
    await arm.click({ trial: true });
    await page.locator('#fish-control').click({ trial: true });
    await fixedScene();
    const charging = await readWorld(page);
    expect(charging.fishing.active!.phase).toBe('charge');
    const lockedDot = await dotPosition();
    await tilt(page, 40, 40);
    expect(await dotPosition()).toEqual(lockedDot);
    expect(await readWorld(page)).toEqual(charging);
    await page.screenshot({ path: testInfo.outputPath('motion-charge.png') });
    await page.locator('#motion-quick-toggle').click();
    await expect(guide).toBeHidden();
    await expect(arm).toBeHidden();
    await expect(page.locator('#fish-control')).toBeInViewport({ ratio: 1 });
    expect(await readWorld(page)).toEqual(charging);
    await fixedScene();
    await page.locator('#fish-control').focus();
    await page.keyboard.down('Space');
    await expect
      .poll(async () => (await readWorld(page)).fishing.active!.power)
      .toBeGreaterThan(0);
    await page.keyboard.up('Space');
    await expect
      .poll(async () => (await readWorld(page)).fishing.active!.phase)
      .not.toBe('charge');
    await expect(guide).toBeHidden();
    await page.locator('#fish-cancel').click();
    expect(errors).toEqual([]);
  });

for (const capability of ['aim-only', 'flick-only'] as const)
  test(`partial sensor permission keeps ${capability} usable with accurate status and manual controls`, async ({
    page,
  }) => {
    await sensor(page, capability);
    const before = await readWorld(page);
    await page.locator('#motion-toggle').click();
    expect(await calls(page)).toEqual([true, true]);
    await tilt(page, 0);
    await accelerate(page, 0);
    await expect(page.locator('#motion-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const message = capability === 'aim-only' ? '倾斜瞄准' : '甩竿读数有效';
    await expect(page.locator('#motion-status')).toContainText(message);
    await expect(page.locator('#motion-quick-status')).toContainText(message);
    if (capability === 'aim-only')
      await expect(page.locator('#motion-calibrate')).toBeEnabled();
    else await expect(page.locator('#motion-calibrate')).toBeDisabled();
    await closeRiverPanel(page);
    await expect(page.locator('#motion-guide')).toContainText(
      capability === 'aim-only' ? '按钮抛竿' : '拖动瞄准',
    );
    await tilt(page, 20);
    await expect(page.locator('#fish-direction')).toHaveValue(
      capability === 'aim-only' ? '-5' : '-30',
    );
    expect(await readWorld(page)).toEqual(before);
    await page.locator('#cast-start').click();
    await expect(page.locator('#fish-control')).toBeEnabled();
    if (capability === 'aim-only') {
      await expect(page.locator('#motion-cast-arm')).toBeHidden();
      await expect(page.locator('#motion-guide')).toContainText('按钮抛竿');
      await page.locator('#fish-control').focus();
      await page.keyboard.down('Space');
      await expect
        .poll(async () => (await readWorld(page)).fishing.active!.power)
        .toBeGreaterThan(0);
      await page.keyboard.up('Space');
    } else {
      await expect(page.locator('#motion-guide-title')).toHaveText('体感甩竿');
      await expect(page.locator('#motion-cast-arm')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await accelerate(page, 0);
      await accelerate(page, -6);
    }
    await expect
      .poll(async () => (await readWorld(page)).fishing.active!.phase)
      .not.toBe('charge');
    await expect(page.locator('#motion-guide')).toBeHidden();
    await page.locator('#fish-cancel').click();
  });

test('optional tilt requests permission on a click and changes only the aiming preview with calibration and touch fallback', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await sensor(page);
  await expect(page.locator('#motion-toggle')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(await calls(page)).toEqual([]);
  const before = await readWorld(page);
  await closeRiverPanel(page);
  await expect(page.locator('#motion-quick-toggle')).toBeInViewport({
    ratio: 1,
  });
  await page.locator('#motion-quick-toggle').click();
  await expect(page.locator('#motion-quick-status')).toContainText(
    '等待传感器读数',
  );
  expect(await calls(page)).toEqual([true, true]);
  await tilt(page, 10);
  await accelerate(page, 0);
  await expect(page.locator('#motion-quick-status')).toContainText(
    '体感已生效',
  );
  await expect(page.locator('#motion-calibrate')).toBeEnabled();
  await closeRiverPanel(page);
  await tilt(page, 12);
  await expect(page.locator('#fish-direction')).toHaveValue('-30');
  await tilt(page, 30, 20);
  await expect(page.locator('#fish-direction')).toHaveValue('-5');
  await expect(page.locator('#fish-depth')).toHaveValue('75');
  await expect(page.locator('#depth-value')).toContainText('75');
  await expect(page.locator('#direction-value')).toContainText('5°');
  await tilt(page, 90);
  await expect(page.locator('#fish-direction')).toHaveValue('45');
  // Return through neutral before moving left; a sign flip at an Euler
  // representation boundary is covered by the continuous-pose test below.
  await tilt(page, 0);
  await tilt(page, -90);
  await expect(page.locator('#fish-direction')).toHaveValue('-45');
  expect(await readWorld(page)).toEqual(before);
  await openGear(page);
  await tilt(page, 0);
  await page.locator('#fish-direction').focus();
  await page.locator('#fish-direction').press('End');
  await expect(page.locator('#fish-direction')).toHaveValue('45');
  await closeRiverPanel(page);
  await tilt(page, 0);
  await expect(page.locator('#fish-direction')).toHaveValue('45');
  await tilt(page, -10);
  await expect(page.locator('#fish-direction')).toHaveValue('35');
  await openGear(page, 'supplies');
  await page.locator('#motion-calibrate').click();
  await closeRiverPanel(page);
  await tilt(page, -10);
  await expect(page.locator('#fish-direction')).toHaveValue('0');
  await expect(page.locator('#fish-depth')).toHaveValue('50');
  await openGear(page, 'supplies');
  await page.locator('#motion-toggle').click();
  await closeRiverPanel(page);
  await tilt(page, 80);
  await expect(page.locator('#fish-direction')).toHaveValue('0');
  expect(await readWorld(page)).toEqual(before);
  await page.reload();
  await ready(page);
  await openGear(page, 'supplies');
  await expect(page.locator('#motion-toggle')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(await calls(page)).toEqual([]);
});

test(
  'continuous phone poses cross Euler boundaries without flipping the aiming point',
  { tag: '@motion-smoke' },
  async ({ page }) => {
    await sensor(page);
    await page.locator('#motion-toggle').click();
    await closeRiverPanel(page);
    const before = await readWorld(page);
    const direction = page.locator('#fish-direction');
    const depth = page.locator('#fish-depth');
    await tilt(page, 85, 10);
    await page.locator('#motion-quick-calibrate').click();
    const start = Number(await direction.inputValue());
    const initialDepth = await depth.inputValue();
    const directions: number[] = [start];
    // The browser changes both Euler branches when the phone passes 90°.
    for (const [gamma, beta] of [
      [89, 10],
      [-89, 170],
      [-85, 170],
    ] as const) {
      await tilt(page, gamma, beta);
      directions.push(Number(await direction.inputValue()));
      await expect(depth).toHaveValue(initialDepth);
    }
    for (let i = 1; i < directions.length; i++) {
      expect(directions[i]! - directions[i - 1]!).toBeGreaterThanOrEqual(0);
      expect(directions[i]! - directions[i - 1]!).toBeLessThanOrEqual(10);
    }
    expect(directions.at(-1)).toBeGreaterThan(start);
    for (const [gamma, beta] of [
      [-89, 170],
      [89, 10],
      [85, 10],
    ] as const)
      await tilt(page, gamma, beta);
    await expect(direction).toHaveValue(String(start));

    await page.locator('#motion-quick-toggle').click();
    await page.locator('#motion-quick-toggle').click();
    await tilt(page, 5, 179);
    await page.locator('#motion-quick-calibrate').click();
    const depthStart = Number(await depth.inputValue());
    const directionStart = await direction.inputValue();
    await tilt(page, 5, -179);
    await expect(depth).toHaveValue(String(depthStart));
    await tilt(page, 5, -175);
    expect(Number(await depth.inputValue())).toBeGreaterThan(depthStart);
    expect(Number(await depth.inputValue()) - depthStart).toBeLessThanOrEqual(
      10,
    );
    await expect(direction).toHaveValue(directionStart);
    await tilt(page, 5, 179);
    await expect(depth).toHaveValue(String(depthStart));
    expect(await readWorld(page)).toEqual(before);
    await page.locator('#motion-quick-toggle').click();
    await tilt(page, -40, 30);
    await expect(direction).toHaveValue(directionStart);
    await expect(depth).toHaveValue(String(depthStart));
    expect(await readWorld(page)).toEqual(before);
  },
);

test('tilt is inactive in tools, city, hidden or unfocused pages and while fishing; rotation requires calibration', async ({
  page,
}) => {
  await sensor(page);
  await page.locator('#motion-toggle').click();
  await tilt(page, 0);
  await accelerate(page, 0);
  await closeRiverPanel(page);
  await tilt(page, 10);
  const direction = page.locator('#fish-direction');
  await expect(direction).toHaveValue('-20');
  await openGear(page, 'supplies');
  await tilt(page, 40);
  await expect(direction).toHaveValue('-20');
  await closeRiverPanel(page);
  await page.locator('#visit-city').click();
  await tilt(page, -30);
  await expect(direction).toHaveValue('-20');
  await page.locator('#visit-river').click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await tilt(page, 30);
  await expect(direction).toHaveValue('-20');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await tilt(page, 30);
  await expect(direction).toHaveValue('-20');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await tilt(page, -30);
  await expect(direction).toHaveValue('-20');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(screen.orientation, 'angle', {
      configurable: true,
      value: 90,
    });
    screen.orientation.dispatchEvent(new Event('change'));
  });
  await tilt(page, 0, 20);
  await expect(direction).toHaveValue('-20');
  await openGear(page, 'supplies');
  await expect(page.locator('#motion-status')).toContainText('校准');
  await page.locator('#motion-calibrate').click();
  await closeRiverPanel(page);
  await expect(direction).toHaveValue('0');
  await expect(page.locator('#fish-depth')).toHaveValue('50');
  await tilt(page, 0, 10);
  await expect(direction).toHaveValue('10');
  await page.locator('#cast-start').click();
  const before = await readWorld(page);
  await tilt(page, 0, -40);
  await expect(direction).toHaveValue('10');
  expect(await readWorld(page)).toEqual(before);
});

for (const [mode, message] of [
  ['denied', '未获授权'],
  ['error', '无法启用'],
  ['unsupported', '不支持'],
  ['http', 'HTTPS'],
] as const)
  test(`motion gracefully falls back for ${mode}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await sensor(page, mode);
    const before = await readWorld(page);
    if (mode === 'unsupported') {
      await closeRiverPanel(page);
      await page.locator('#motion-quick-toggle').click();
      await expect(page.locator('#motion-quick-status')).toContainText(
        '继续用按钮',
      );
    } else await page.locator('#motion-toggle').click();
    await expect(page.locator('#motion-status')).toContainText(message);
    await expect(page.locator('#motion-toggle')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.locator('#motion-guide')).toBeHidden();
    if (mode === 'http' || mode === 'unsupported')
      expect(await calls(page)).toEqual([]);
    await openGear(page);
    await page.locator('#fish-direction').focus();
    await page.locator('#fish-direction').press('Home');
    await expect(page.locator('#fish-direction')).toHaveValue('-45');
    expect(await readWorld(page)).toEqual(before);
    if (mode === 'unsupported') {
      await page.locator('#fish-depth').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('#fish-depth')).toHaveValue('5');
      await closeRiverPanel(page);
      const bounds = (await page.locator('canvas').boundingBox())!;
      await page.locator('canvas').click({
        position: {
          x: (bounds.width * 330) / 640,
          y: (bounds.height * 250) / 640,
        },
      });
      expect(await readWorld(page)).toEqual(before);
      await expect(page.locator('#cast-start')).toBeEnabled();
      const geometry = async (selector: string) =>
        page.locator(selector).evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const stage = document
            .getElementById('fishing-stage')!
            .getBoundingClientRect();
          const transform = new DOMMatrixReadOnly(
            getComputedStyle(element).transform,
          );
          return {
            x: rect.x - stage.x - transform.e,
            y: rect.y - stage.y - transform.f,
            width: rect.width,
            height: rect.height,
          };
        });
      const readyGeometry = await geometry('#game');
      await page.locator('#cast-start').click();
      const buttonGeometry = await geometry('#fish-control');
      await expect(page.locator('#fish-control')).toBeVisible();
      await expect(page.locator('#fish-control')).toBeEnabled();
      await expect(page.locator('#motion-cast-arm')).toBeHidden();
      const phases: string[] = [];
      await catchFish(page, 'keyboard', async (phase) => {
        phases.push(phase);
        const game = await geometry('#game');
        for (const key of ['x', 'y', 'width', 'height'] as const)
          expect(
            Math.abs(game[key] - readyGeometry[key]),
            `${phase} scene ${key}`,
          ).toBeLessThan(1);
        if (phase !== 'ready') {
          const control = await geometry('#fish-control');
          for (const key of ['x', 'y', 'width', 'height'] as const)
            expect(
              Math.abs(control[key] - buttonGeometry[key]),
              `${phase} control ${key}`,
            ).toBeLessThan(1);
        }
      });
      expect(phases).toEqual(['charge', 'hook', 'fight', 'ready']);
      expect((await readWorld(page)).fishing.inventory).toHaveLength(1);
      expect((await readWorld(page)).fishing.lastResult!.caught).toBe(true);
      await expect(page.locator('#catch-reveal')).toContainText('银鱼');
    }
    expect(errors).toEqual([]);
  });

test('a browser with no permission prompt still requires opt-in and reports missing sensor readings', async ({
  page,
}) => {
  await sensor(page, 'implicit');
  const before = await readWorld(page);
  await page.locator('#motion-toggle').click();
  await expect(page.locator('#motion-toggle')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await closeRiverPanel(page);
  await expect(page.locator('#motion-guide-title')).toHaveText('体感连接中');
  await tilt(page, null);
  await expect(page.locator('#motion-status')).toContainText('未收到', {
    timeout: 5000,
  });
  await expect(page.locator('#motion-toggle')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#motion-guide-title')).toHaveText('体感连接中');
  await expect(page.locator('#cast-start')).toBeVisible();
  expect(await readWorld(page)).toEqual(before);
  expect(await calls(page)).toEqual([]);
  await page.locator('#motion-quick-toggle').click();
  await expect(page.locator('#motion-guide')).toBeHidden();
  await expect(page.locator('#motion-toggle')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(await readWorld(page)).toEqual(before);
});

test('armed forward flicks produce different validated casting power and settle only once; horizontal shaking is ignored', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await sensor(page);
  await page.locator('#motion-toggle').click();
  await tilt(page, 0);
  await accelerate(page, 0);
  await closeRiverPanel(page);
  await tilt(page, 10, 20);
  const aimDepth = Number(await page.locator('#fish-depth').inputValue());
  const worldBefore = await readWorld(page);
  await accelerate(page, -16);
  expect(await readWorld(page)).toEqual(worldBefore);
  const readyWorld = await readWorld(page);
  await page.locator('#cast-start').click();
  for (const selector of ['#motion-cast-arm', '#fish-control']) {
    const bounds = (await page.locator(selector).boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(360);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(640);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('motion-ready.png') });
  const started = await readWorld(page);
  expect(started.fishing.active!.aimDepth).toBe(aimDepth);
  await accelerate(page, -16);
  expect((await readWorld(page)).fishing.active!.phase).toBe('charge');
  await expect(page.locator('#motion-cast-arm')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(
    await page.locator('#motion-cast-arm').evaluate((button) => {
      const bounds = button.getBoundingClientRect();
      return bounds.bottom <= innerHeight && bounds.right <= innerWidth;
    }),
  ).toBe(true);
  // The first -16 reading above can be a startup spike and must be ignored.
  await accelerate(page, -2, 18);
  await accelerate(page, -2, -18);
  expect((await readWorld(page)).fishing.active!.phase).toBe('charge');
  await accelerate(page, -5);
  await expect(page.locator('#motion-power-value')).toContainText(/\d+%/);
  const shownPower = Number(
    (await page.locator('#motion-power-value').textContent())?.match(
      /\d+/,
    )?.[0],
  );
  expect(shownPower).toBeGreaterThan(0);
  await expect
    .poll(async () => (await readWorld(page)).fishing.active!.phase)
    .not.toBe('charge');
  await expect(page.locator('#motion-guide')).toBeHidden();
  const weak = (await readWorld(page)).fishing.active!.power;
  expect(shownPower).toBe(weak);
  expect(weak).toBeGreaterThan(0);
  expect(weak).toBeLessThan(60);
  const firstRun = started.fishing.active!.id;
  await accelerate(page, -20);
  expect((await readWorld(page)).fishing.active!.power).toBe(weak);
  expect((await readWorld(page)).cats[0]!.needs.energy).toBe(
    readyWorld.cats[0]!.needs.energy - 8,
  );
  await page.locator('#fish-cancel').click();
  await page.locator('#cast-start').click();
  await expect(page.locator('#motion-cast-arm')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await accelerate(page, 0);
  await accelerate(page, -13);
  await expect
    .poll(async () => (await readWorld(page)).fishing.active!.phase)
    .not.toBe('charge');
  const strong = (await readWorld(page)).fishing.active!.power;
  expect(strong).toBeGreaterThan(weak);
  expect(strong).toBeGreaterThan(80);
  const casts = await page.evaluate(() =>
    window
      .CAT_CITY_DEBUG!.getReplay()
      .entries.filter((entry) => entry.command.type === 'FISH_CAST'),
  );
  expect(casts).toHaveLength(2);
  expect(casts[0]!.command).toMatchObject({
    type: 'FISH_CAST',
    runId: firstRun,
    power: weak,
  });
  expect(casts.every((entry) => entry.result.ok)).toBe(true);
  await page.locator('#fish-pause').click();
  await page.screenshot({ path: testInfo.outputPath('motion-cast.png') });
});

test('leaving the scene, losing focus, opening tools or holding the button cancels an armed flick', async ({
  page,
}) => {
  await sensor(page);
  await page.locator('#motion-toggle').click();
  await tilt(page, 0);
  await accelerate(page, 0);
  await closeRiverPanel(page);
  await page.locator('#cast-start').click();
  const arm = page.locator('#motion-cast-arm');
  const spike = async () => {
    await accelerate(page, 0);
    await accelerate(page, -16);
  };
  await expect(arm).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await spike();
  expect((await readWorld(page)).fishing.active!.phase).toBe('charge');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(arm).toHaveAttribute('aria-pressed', 'false');
  await arm.click();
  await openGear(page, 'supplies');
  await spike();
  expect((await readWorld(page)).fishing.active!.phase).toBe('charge');
  await closeRiverPanel(page);
  await expect(arm).toHaveAttribute('aria-pressed', 'false');
  await arm.click();
  await page.locator('#visit-city').click();
  await spike();
  expect((await readWorld(page)).fishing.active!.phase).toBe('charge');
  await page.locator('#visit-river').click();
  await expect(arm).toHaveAttribute('aria-pressed', 'false');
  await arm.click();
  await page.locator('#fish-control').focus();
  await page.keyboard.down('Space');
  await expect(arm).toHaveAttribute('aria-pressed', 'false');
  await spike();
  await page.keyboard.up('Space');
  expect(
    await page.evaluate(() =>
      window
        .CAT_CITY_DEBUG!.getReplay()
        .entries.filter((entry) => entry.command.type === 'FISH_CAST'),
    ),
  ).toEqual([]);
});
