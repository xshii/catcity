import { expect, test, type Page } from '@playwright/test';
import { ready, readWorld } from '../../harness/adapters/catcity/browser';
import {
  closeRiverPanel,
  openGear,
} from '../../harness/adapters/catcity/navigation';

async function enableSensors(page: Page) {
  await page.addInitScript(() => {
    for (const name of ['DeviceOrientationEvent', 'DeviceMotionEvent']) {
      const api = class extends Event {};
      Object.assign(api, {
        requestPermission: () => Promise.resolve('granted'),
      });
      Object.defineProperty(window, name, { configurable: true, value: api });
    }
  });
  await page.goto('/');
  await ready(page);
  await openGear(page, 'supplies');
  await page.locator('#motion-toggle').click();
  await closeRiverPanel(page);
}

async function orientation(page: Page, gamma: number) {
  await page.evaluate((value) => {
    const event = new Event('deviceorientation');
    Object.defineProperties(event, {
      gamma: { value },
      beta: { value: 0 },
    });
    window.dispatchEvent(event);
  }, gamma);
}

async function motion(page: Page, z = 0) {
  await page.evaluate((value) => {
    const event = new Event('devicemotion');
    Object.defineProperty(event, 'acceleration', {
      value: { x: 0, y: 0, z: value },
    });
    window.dispatchEvent(event);
  }, z);
}

async function expectDelayed(page: Page) {
  await expect(page.locator('#motion-status')).toContainText('仍在等待', {
    timeout: 5000,
  });
  await expect(page.locator('#motion-quick-toggle')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

test(
  'late valid sensor readings recover after the initial waiting deadline',
  { tag: '@motion-smoke' },
  async ({ page }) => {
    await enableSensors(page);
    const before = await readWorld(page);
    await expectDelayed(page);
    await expect(page.locator('#motion-guide-title')).toHaveText('体感连接中');
    await expect(page.locator('#cast-start')).toBeEnabled();
    const initialDirection = await page.locator('#fish-direction').inputValue();
    await orientation(page, 0);
    await motion(page);
    await orientation(page, 15);
    await expect(page.locator('#motion-guide-title')).toHaveText('体感瞄准');
    await expect(page.locator('#fish-direction')).not.toHaveValue(
      initialDirection,
    );
    await expect(page.locator('#motion-cast-arm')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(await readWorld(page)).toEqual(before);
    await page.locator('#cast-start').click();
    await expect(page.locator('#motion-cast-arm')).toBeVisible();
    await expect(page.locator('#fish-control')).toBeEnabled();
  },
);

test(
  'a delayed motion stream restores the retry control without arming an existing cast',
  { tag: '@motion-smoke' },
  async ({ page }) => {
    await enableSensors(page);
    await orientation(page, 0);
    await expectDelayed(page);
    await expect(page.locator('#motion-guide-title')).toHaveText('体感瞄准');
    await page.locator('#cast-start').click();
    const before = await readWorld(page);
    await expect(page.locator('#motion-cast-arm')).toBeHidden();
    await expect(page.locator('#fish-control')).toBeEnabled();
    await motion(page);
    await expect(page.locator('#motion-cast-arm')).toBeVisible();
    await expect(page.locator('#motion-cast-arm')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.locator('#motion-guide-title')).toHaveText('体感甩竿');
    expect(await readWorld(page)).toEqual(before);
    await motion(page, -14);
    await motion(page, -14);
    await expect(page.locator('#motion-cast-arm')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    const after = await readWorld(page);
    expect(after.fishing.active!.phase).toBe('charge');
    expect(after.cats[0]!.needs.energy).toBe(before.cats[0]!.needs.energy);
    expect(
      await page.evaluate(() =>
        window
          .CAT_CITY_DEBUG!.getReplay()
          .entries.filter((entry) => entry.command.type === 'FISH_CAST'),
      ),
    ).toEqual([]);
  },
);

test(
  'explicitly disabling delayed sensors prevents late readings from reactivating motion controls',
  { tag: '@motion-smoke' },
  async ({ page }) => {
    await enableSensors(page);
    await expectDelayed(page);
    await page.locator('#motion-quick-toggle').click();
    const before = await readWorld(page);
    const initialDirection = await page.locator('#fish-direction').inputValue();
    await orientation(page, 0);
    await orientation(page, 35);
    await motion(page);
    await expect(page.locator('#motion-quick-toggle')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.locator('#motion-guide')).toBeHidden();
    await expect(page.locator('#fish-direction')).toHaveValue(initialDirection);
    expect(await readWorld(page)).toEqual(before);
    await page.locator('#cast-start').click();
    await expect(page.locator('#motion-cast-arm')).toBeHidden();
    await expect(page.locator('#motion-cast-arm')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.locator('#fish-control')).toBeEnabled();
    const charge = await readWorld(page);
    await motion(page, -14);
    await motion(page, -14);
    const after = await readWorld(page);
    expect(after.fishing.active!.phase).toBe('charge');
    expect(after.cats[0]!.needs.energy).toBe(charge.cats[0]!.needs.energy);
  },
);
