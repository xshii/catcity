import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { SAVE_VERSION } from '../../src/core/schema';
import {
  enterRiver,
  reachWaterway,
} from '../../harness/adapters/catcity/city-input';
import { catchFish } from '../../harness/adapters/catcity/angling-input';
import { expect, test } from '@playwright/test';
import {
  closeRiverPanel,
  invitePepper,
  openChat,
  openGear,
  showBagFish,
  showFish,
} from '../../harness/adapters/catcity/navigation';
import { ready, readWorld } from '../../harness/adapters/catcity/browser';

// The full build → dialogue → reload → replay loop runs as the harness acceptance
// (`npm run harness -- acceptance`), which also checks console errors and replay.

test('production does not expose debug bridge, even with debug query parameters', async ({
  page,
}) => {
  await page.goto(
    `${localOrigin(testPorts().production)}/?debug=true&test=true`,
  );
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
  await page.goto(`${localOrigin(testPorts().test)}/`);
  await ready(page);
  await expect(page.getByRole('alert')).toContainText('原数据已保留');
  await page.locator('#city-tab-guide').click();
  await page.getByRole('button', { name: '保存进度' }).click();
  expect(
    await page.evaluate(() => localStorage.getItem('cat-city.save.v1')),
  ).toBe('corrupt-save');
});

test('bridge mutations are validated and snapshots cannot mutate the world', async ({
  page,
}) => {
  await page.goto(`${localOrigin(testPorts().test)}/`);
  await ready(page);
  const before = await readWorld(page);
  const rejected = await page.evaluate(() => {
    const bridge = window.CAT_CITY_DEBUG!;
    bridge.getWorldState().coins = 0;
    return [bridge.spawnCat({ x: 20, y: 20 }), bridge.advanceTime(-10)];
  });
  expect(rejected.every((result) => !result.ok)).toBe(true);
  expect(await readWorld(page)).toEqual(before);
});

test('mobile touch layout resumes a shared outing and recalls it after reload', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // This phone plays the button flow; without a choice it would be offered motion.
  await page.addInitScript(() =>
    localStorage.setItem('cat-city.fishing-input', 'buttons'),
  );
  try {
    await page.goto(`${localOrigin(testPorts().test)}/`);
    await ready(page);
    await openChat(page);
    await page.getByRole('button', { name: '今天有点累', exact: true }).tap();
    await expect(page.getByTestId('dialogue')).toContainText('歇一会');
    await page.locator('#city-tab-outing').tap();
    await page.locator('[data-outing-spot="POND"]').tap();
    await reachWaterway(page);
    await page.locator('#begin-fishing').click();
    expect((await readWorld(page)).fishing.active).toBeNull();
    await page.locator('#cast-start').click();
    await page.locator('#fish-control').focus();
    await page.keyboard.down('Space');
    await expect
      .poll(
        async () =>
          Number(
            await page.locator('#angling-bar').getAttribute('aria-valuenow'),
          ),
        { timeout: 5000 },
      )
      .toBeGreaterThanOrEqual(60);
    await page.keyboard.up('Space');
    await page.locator('#fish-pause').click();
    const partial = await readWorld(page);
    await page.reload();
    await ready(page);
    expect(await readWorld(page)).toEqual(partial);
    await page.screenshot({
      path: testInfo.outputPath('fishing-controls.png'),
      fullPage: true,
    });
    await catchFish(page, 'touch');
    await openChat(page);
    await page.getByRole('button', { name: '聊聊我们的回忆' }).tap();
    await expect(page.getByTestId('dialogue')).toContainText('银鱼');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('mobile.png'),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('river animation changes pixels without advancing headless world state', async ({
  page,
}) => {
  await page.goto(`${localOrigin(testPorts().test)}/`);
  await ready(page);
  await enterRiver(page);
  const before = await readWorld(page);
  const first = await page.locator('canvas').screenshot();
  await page.waitForTimeout(400);
  const second = await page.locator('canvas').screenshot();
  expect(first.equals(second)).toBe(false);
  expect(await readWorld(page)).toEqual(before);
});

test('tablet layout keeps the companion panel readable without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(`${localOrigin(testPorts().test)}/`);
  await ready(page);
  await openChat(page);
  const card = await page.locator('.cat-card').boundingBox();
  expect(card!.width).toBeGreaterThanOrEqual(280);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('city guide makes construction, income and the relationship activity discoverable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${localOrigin(testPorts().test)}/`);
  await ready(page);
  await page.locator('#city-tab-guide').click();
  await expect(page.locator('#city-goal')).toHaveText('先给 Mochi 建一间猫咖');
  await page.getByRole('button', { name: '回地图选择空地' }).click();
  expect((await readWorld(page)).buildings).toHaveLength(0);
  await page.locator('[data-build-type=CAT_CAFE]').click();
  await expect(page.getByTestId('coins')).toHaveText('700');
  expect((await readWorld(page)).buildings).toHaveLength(1);
  await page.locator('#city-tab-guide').click();
  // The guide points at the clock speed; the test build advances its clock explicitly.
  await page.getByRole('button', { name: '去调快时间' }).click();
  await expect(page.locator('#clock-speed')).toBeFocused();
  await page.evaluate(() => window.CAT_CITY_DEBUG!.advanceTime(60));
  await expect(page.getByTestId('coins')).toHaveText('710');
  await expect(page.locator('#cafe-income')).toContainText('累计赚取 10 金币');
  await page.reload();
  await ready(page);
  await page.locator('#city-tab-guide').click();
  await expect(page.locator('#city-goal')).toContainText('一起留下回忆');
  await page.getByRole('button', { name: '在地图找到池塘' }).click();
  await expect(page.locator('#visit-city')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await reachWaterway(page);
  await page.locator('#begin-fishing').click();
  expect((await readWorld(page)).fishing.active).toBeNull();
  await page.locator('#cast-start').click();
  await catchFish(page);
  await page.getByRole('button', { name: '小城', exact: true }).click();
  await expect(page.locator('#city-goal')).toHaveText('让小城继续生长');
  await expect(page.locator('#city-instruction')).toContainText(
    '安排公寓与道路',
  );
  await page.locator('#city-tab-guide').click();
  await page.getByRole('button', { name: '和 Mochi 聊聊共同回忆' }).click();
  await expect(page.getByTestId('dialogue')).toBeVisible();
  await expect(page.getByTestId('dialogue')).toContainText('银鱼');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('skill and atlas unlock a new waterway; bait changes catches and Pepper receives a favorite fish', async ({
  page,
}) => {
  // Five real casts plus panel navigation and travel take about two minutes in software-rendered Chromium.
  test.setTimeout(180_000);
  await page.goto(`${localOrigin(testPorts().test)}/`);
  await ready(page);
  await enterRiver(page);
  await openGear(page);
  await expect(
    page.locator('#fish-location option[value="REEDS"]'),
  ).toHaveJSProperty('disabled', true);
  for (let cast = 0; cast < 4; cast++) {
    await openGear(page);
    await page.locator('#fish-direction').focus();
    await page.keyboard.press(cast % 2 ? 'End' : 'Home');
    await closeRiverPanel(page);
    await page.locator('#cast-start').click();
    await catchFish(page);
  }
  expect((await readWorld(page)).fishing.xp).toBe(50);
  await openGear(page);
  await expect(
    page.locator('#fish-location option[value="REEDS"]'),
  ).toHaveJSProperty('disabled', false);
  const beforeTravel = await readWorld(page);
  await page.locator('#fish-location').selectOption('REEDS');
  await expect(page.locator('#visit-city')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect((await readWorld(page)).minute).toBe(beforeTravel.minute);
  await reachWaterway(page, 'REEDS');
  const arrived = await readWorld(page);
  expect(arrived.minute).toBeGreaterThan(beforeTravel.minute);
  expect(arrived.cats[0]!.needs.energy).toBeLessThan(
    beforeTravel.cats[0]!.needs.energy,
  );
  expect(arrived.cats[0]!.fishingSpotId).toBe('REEDS');
  await enterRiver(page, 'REEDS');
  await openGear(page);
  await expect(page.locator('#travel-to-spot')).toBeDisabled();
  await page.locator('#fish-bait').selectOption('WORM');
  await closeRiverPanel(page);
  await expect(page.locator('#cast-start')).toBeEnabled();
  await page.locator('#cast-start').click();
  await catchFish(page);
  const world = await readWorld(page);
  expect(world.minute).toBe(arrived.minute);
  const perch = world.fishing.inventory.find(
    (fish) => fish.speciesId === 'PERCH',
  )!;
  expect(perch).toBeDefined();
  await invitePepper(page);
  const pepper = (await readWorld(page)).cats.find(
    (cat) => cat.definitionId === 'PEPPER',
  )!;
  await openGear(page);
  await page.locator('#fish-companion').selectOption(pepper.id);
  await showBagFish(page, perch.id);
  await expect(page.locator('#fish-tastes')).toContainText('鲈鱼、鲶鱼');
  await page.locator(`[data-gift-fish="${perch.id}"]`).click();
  expect(
    (await readWorld(page)).cats.find((cat) => cat.id === pepper.id)!.fishGift!
      .favorite,
  ).toBe(true);
  const before = await readWorld(page);
  await page.reload();
  await ready(page);
  expect(await readWorld(page)).toEqual(before);
  await enterRiver(page);
  await openGear(page);
  await expect(
    page.locator('#fish-location option[value="REEDS"]'),
  ).toHaveJSProperty('disabled', false);
  await expect(
    page.locator('#fish-location option[value="MOON"]'),
  ).toHaveJSProperty('disabled', true);
});

test('old demo saves require an explicit reset; atlas shows all tiers, lengths and breed requirements', async ({
  page,
}) => {
  const oldSave = JSON.stringify({
    saveVersion: 3,
    contentVersion: 1,
    world: {},
  });
  await page.addInitScript(
    (value) => localStorage.setItem('cat-city.save.v1', value),
    oldSave,
  );
  await page.goto(`${localOrigin(testPorts().test)}/`);
  await ready(page);
  await expect(page.getByRole('alert')).toContainText('原数据已保留');
  expect(
    await page.evaluate(() => localStorage.getItem('cat-city.save.v1')),
  ).toBe(oldSave);
  await page.getByRole('button', { name: '清除旧试玩存档，开始新版' }).click();
  await expect(page.getByRole('alert')).toBeHidden();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('cat-city.save.v1')!).saveVersion,
    ),
  ).toBe(SAVE_VERSION);
  await enterRiver(page);
  for (const [stars, species] of [
    [0, 'SILVER'],
    [1, 'CRUCIAN'],
    [2, 'PERCH'],
    [3, 'CATFISH'],
    [4, 'KOI'],
    [5, 'MOON_CARP'],
    [2, 'MACKEREL'],
    [3, 'SEA_BREAM'],
  ] as const) {
    await showFish(page, species);
    await expect(page.locator(`[data-species="${species}"]`)).toHaveAttribute(
      'data-stars',
      String(stars),
    );
  }
  await showFish(page, 'SILVER');
  await expect(page.locator('[data-species="SILVER"]')).toContainText(
    '家门口池塘',
  );
  await expect(page.locator('[data-species="SILVER"]')).toContainText(
    '芦苇河湾',
  );
  await expect(page.locator('[data-species="SILVER"]')).toContainText(
    '8.0～18.0 cm',
  );
  await showFish(page, 'SEA_BREAM');
  await expect(page.locator('[data-species="SEA_BREAM"]')).toContainText(
    '潮汐海岸',
  );
  await expect(page.locator('[data-species="SEA_BREAM"]')).toContainText(
    '25.0～90.0 cm',
  );
  await expect(page.locator('[data-species="SEA_BREAM"]')).not.toContainText(
    '家门口池塘',
  );
  await expect(page.locator('[data-species="SEA_BREAM"]')).not.toContainText(
    '芦苇河湾',
  );
  await showFish(page, 'MOON_CARP');
  await expect(page.locator('[data-species="MOON_CARP"]')).toContainText(
    '鱼种最大长度：120.0 cm',
  );
  await expect(page.locator('[data-species="MOON_CARP"]')).toContainText(
    '需更换同行猫',
  );
  await showFish(page, 'KOI');
  await expect(page.locator('[data-species="KOI"]')).toContainText(
    '品种条件已满足',
  );
  await invitePepper(page);
  const pepper = (await readWorld(page)).cats.find(
    (cat) => cat.definitionId === 'PEPPER',
  )!;
  await openGear(page);
  await page.locator('#fish-companion').selectOption(pepper.id);
  await showFish(page, 'MOON_CARP');
  await expect(page.locator('[data-species="MOON_CARP"]')).toContainText(
    '品种条件已满足',
  );
  await showFish(page, 'KOI');
  await expect(page.locator('[data-species="KOI"]')).toContainText(
    '需更换同行猫',
  );
});
