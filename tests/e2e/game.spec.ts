import { expect, test } from '@playwright/test';
import {
  createCatCityAdapter,
  ready,
  readWorld,
} from '../../harness/adapters/catcity/browser';

test('build cafe → meet cat → dialogue → save → reload → replay', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const adapter = createCatCityAdapter();
  await page.goto('/');
  try {
    await adapter.exercise(page, async (name, action) => {
      await test.step(name, action);
    });
    const evidence = await adapter.collect(page);
    adapter.verifyReplay(evidence);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('screenshot.png'),
      fullPage: true,
    });
    await testInfo.attach('world.json', {
      body: JSON.stringify(evidence['world.json'], null, 2),
      contentType: 'application/json',
    });
  } finally {
    await testInfo.attach('console.json', {
      body: JSON.stringify(errors),
      contentType: 'application/json',
    });
  }
});

test('production does not expose debug bridge, even with debug query parameters', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4174/?debug=true&test=true');
  await expect(page.locator('canvas')).toBeVisible();
  expect(await page.evaluate(() => 'CAT_CITY_DEBUG' in window)).toBe(false);
  expect(
    await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .some((entry) => /bridge-/.test(entry.name)),
    ),
  ).toBe(false);
});

test('corrupt save remains untouched and the player sees the error', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('cat-city.save.v1', 'corrupt-save'),
  );
  await page.goto('/');
  await ready(page);
  await expect(page.getByRole('alert')).toContainText('原数据已保留');
  await page.getByRole('button', { name: '保存进度' }).click();
  expect(
    await page.evaluate(() => localStorage.getItem('cat-city.save.v1')),
  ).toBe('corrupt-save');
});

test('bridge mutations are validated and snapshots cannot mutate the world', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  const before = await readWorld(page);
  const rejected = await page.evaluate(() => {
    const bridge = window.CAT_CITY_DEBUG!;
    bridge.getWorldState().coins = 0;
    return [
      bridge.addCoins(-1),
      bridge.spawnCat({ x: 20, y: 20 }),
      bridge.advanceTime(-10),
    ];
  });
  expect(rejected.every((result) => !result.ok)).toBe(true);
  expect(await readWorld(page)).toEqual(before);
});
