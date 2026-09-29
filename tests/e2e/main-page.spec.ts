import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { expect, test, type Page } from '@playwright/test';
import {
  barInsetsOf,
  clickTile,
  settle,
} from '../../harness/adapters/catcity/city-input';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import type { Position } from '../../src/core';
import { MAP_VIEW } from '../../src/view/city/geometry';

// Spec 014: the city page on a phone — messages, entry points, selecting a
// cat, first-screen guidance, map framing and the clock speed.

const tileOnScreen = (page: Page, position: Position) =>
  page.evaluate(
    (tile) => window.CAT_CITY_DEBUG!.getTileScreenPosition(tile)!,
    position,
  );

/** The board's on-screen box (tiles plus the board margin), from the first/last tile centres. */
async function board(page: Page) {
  const { map } = await readWorld(page);
  const first = await tileOnScreen(page, { x: 0, y: 0 });
  const next = await tileOnScreen(page, { x: 1, y: 0 });
  const last = await tileOnScreen(page, {
    x: map.width - 1,
    y: map.height - 1,
  });
  const tile = next.x - first.x;
  const edge = tile / 2 + (tile * MAP_VIEW.padding) / MAP_VIEW.tile;
  return {
    tile,
    left: first.x - edge,
    right: last.x + edge,
    top: first.y - edge,
    bottom: last.y + edge,
  };
}

/**
 * Centred on an axis when it fits; otherwise the map covers the frame. Vertically that
 * frame is the open band between the floating bars (spec 031), so no row hides under them.
 */
async function expectFramed(page: Page) {
  await settle(page);
  const frame = (await page.locator('#game').boundingBox())!;
  const canvas = (await page.locator('#game canvas').boundingBox())!;
  // The canvas uses the whole frame, including the vertical space.
  expect(Math.abs(canvas.width - frame.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(canvas.height - frame.height)).toBeLessThanOrEqual(1);
  const box = await board(page);
  const bars = await barInsetsOf(page, frame);
  expect(bars.top).toBeGreaterThan(0);
  expect(bars.bottom).toBeGreaterThan(0);
  for (const [low, high, start, size] of [
    [box.left, box.right, frame.x, frame.width],
    [
      box.top,
      box.bottom,
      frame.y + bars.top,
      frame.height - bars.top - bars.bottom,
    ],
  ] as const) {
    if (high - low <= size + 1)
      expect(Math.abs((low + high) / 2 - (start + size / 2))).toBeLessThan(2);
    else {
      expect(low).toBeLessThanOrEqual(start + 1);
      expect(high).toBeGreaterThanOrEqual(start + size - 1);
    }
  }
  return box;
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
  { width: 1280, height: 1000 },
]) {
  test(`the map is centred between the floating bars in follow and overview at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await ready(page);
    const phone = viewport.width <= 760;
    await expect(page.locator('#city-overview')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    const follow = await expectFramed(page);
    await page.locator('#city-overview').click();
    await expect(page.locator('#city-overview')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const overview = await expectFramed(page);
    expect(follow.tile).toBeGreaterThan(overview.tile);
    // Canvas sizes round to whole logical pixels, a few hundredths of a CSS pixel.
    if (phone)
      expect(overview.tile).toBeGreaterThanOrEqual(MAP_VIEW.minTilePx - 0.1);
    const frame = (await page.locator('#game').boundingBox())!;
    if (overview.right - overview.left > frame.width + 1) {
      // Too wide to fit at a readable size: dragging pans instead of selecting.
      const before = await readWorld(page);
      const centre = {
        x: frame.x + frame.width / 2,
        y: frame.y + frame.height / 2,
      };
      await page.mouse.move(centre.x, centre.y);
      await page.mouse.down();
      await page.mouse.move(centre.x + 30, centre.y, { steps: 3 });
      await page.mouse.move(centre.x + 60, centre.y, { steps: 3 });
      await page.mouse.up();
      const panned = await expectFramed(page);
      expect(panned.left).toBeGreaterThan(overview.left + 10);
      await expect(page.locator('#city-action-card')).toBeHidden();
      expect(await readWorld(page)).toEqual(before);
    }
  });
}

test('a new game guides the next step above the map and keeps one clock control', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await ready(page);
  await expect(page.locator('#notice')).not.toContainText('欢迎回来');
  await expect(page.locator('#city-hint')).toContainText('下一步');
  await expect(page.locator('#city-hint')).toContainText('猫咖');
  await expect(page.locator('#city-hint')).toBeInViewport({ ratio: 1 });
  // One time control, next to the clock and the coins in the floating scene bar.
  await expect(
    page.getByRole('button', { name: /快进|营业一小时/ }),
  ).toHaveCount(0);
  await expect(page.locator('#clock-speed')).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('coins')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.topbar')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('地图种子');

  // Guide tab (renamed from 建设): tutorial, explicit save, no developer info.
  await expect(page.locator('#city-tab-guide')).toContainText('指引');
  await page.locator('#city-tab-guide').click();
  await expect(page.locator('#city-panel-guide #save')).toBeVisible();
  // Saving is automatic; the guide says so beside the explicit save.
  await expect(page.locator('#city-save')).toContainText('自动保存');
  await expect(page.locator('#city-panel-guide')).not.toContainText('种子');
  await page.getByRole('button', { name: '回地图选择空地' }).click();
  await page.locator('[data-build-type=CAT_CAFE]').click();
  await expect(page.locator('#city-hint')).toContainText('下一步');
  await expect(page.locator('#city-hint')).toContainText('速度');
  await page.locator('#city-tab-guide').click();
  await expect(page.locator('#city-goal')).toContainText('第一笔收入');
  await page.locator('#city-action').click();
  await expect(page.locator('#river-tools')).toBeHidden();
  await expect(page.locator('#clock-speed')).toBeFocused();
  expect((await readWorld(page)).minute).toBe(0);
  await page.evaluate(() => window.CAT_CITY_DEBUG!.advanceTime(60));
  await expect(page.locator('#city-hint')).toContainText('池塘');

  await page.reload();
  await ready(page);
  await expect(page.locator('#notice')).toContainText('欢迎回来');
});

test('the clock speed cycles 1× → 2× → 4× → 1×, is remembered, and minigames run at 1×', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await ready(page);
  const speed = page.locator('#clock-speed');
  await expect(speed).toContainText('1×');
  for (const label of ['2×', '4×', '1×', '2×', '4×']) {
    await speed.click();
    await expect(speed).toContainText(label);
  }
  await page.reload();
  await ready(page);
  await expect(speed).toContainText('4×');
  await expect(speed).toBeEnabled();
  // Entering the river (a minigame) drops to 1× and locks the control.
  await page.locator('#visit-river').click();
  await expect(page.locator('#visit-river')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(speed).toBeDisabled();
  await expect(speed).toContainText('1×');
  await expect(speed).toContainText('钓鱼');
  await page.locator('#visit-city').click();
  await expect(speed).toBeEnabled();
  await expect(speed).toContainText('1×');
  await page.reload();
  await ready(page);
  await expect(speed).toContainText('1×');
});

test('a production clock advances faster at 4×', async ({ page }) => {
  await page.goto(`${localOrigin(testPorts().production)}/`);
  await expect(page.locator('canvas')).toBeVisible();
  const minute = () =>
    page.evaluate(() => {
      const save = localStorage.getItem('cat-city.save.v1');
      return save ? (JSON.parse(save).world.minute as number) : 0;
    });
  await expect.poll(minute, { timeout: 5000 }).toBeGreaterThan(0);
  const slow = await minute();
  await page.waitForTimeout(3000);
  expect((await minute()) - slow).toBeLessThanOrEqual(5);
  await page.locator('#clock-speed').click();
  await page.locator('#clock-speed').click();
  await expect(page.locator('#clock-speed')).toContainText('4×');
  const fast = await minute();
  await page.waitForTimeout(3000);
  expect((await minute()) - fast).toBeGreaterThanOrEqual(8);
});

test('tile cards explain disabled actions in words and offer road removal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await ready(page);
  const reason = page.locator('#city-action-reason');
  // Land far from the road network: buying works, building cannot connect.
  await clickTile(page, 7, 9);
  await expect(page.locator('#city-selection-label')).not.toContainText(
    /[A-J]\d/,
  );
  await page.locator('#buy-land').click();
  for (const type of ['CAT_CAFE', 'CAT_APARTMENT'])
    await expect(page.locator(`[data-build-type=${type}]`)).toBeDisabled();
  await expect(reason).toBeVisible();
  await expect(reason).toContainText('路网');
  await expect(page.locator('#place-road')).toBeEnabled();
  await expect(page.locator('#place-road')).toContainText('30');
  await expect(page.locator('body')).not.toContainText(/[A-Z]{2,}_[A-Z_]+/);

  // Starter roads: one can be removed for a full refund, the crossroads cannot.
  const coins = (await readWorld(page)).coins;
  await clickTile(page, 3, 5);
  await expect(page.locator('#upgrade-road')).toContainText('40');
  await expect(page.locator('#remove-road')).toContainText('退 30 金币');
  await page.locator('#remove-road').click();
  const removed = await readWorld(page);
  expect(removed.coins).toBe(coins + 30);
  expect(removed.map.tiles[5 * removed.map.width + 3]!.road).toBeNull();
  await expect(page.locator('[data-build-type=CAT_CAFE]')).toBeEnabled();
  await clickTile(page, 5, 5);
  await expect(page.locator('#remove-road')).toBeDisabled();
  await expect(reason).toContainText('断开');

  // Idle cats recover by themselves: no rest button on the map or the cats page.
  const cat = removed.cats[0]!;
  await clickTile(page, cat.position.x, cat.position.y);
  await expect(page.locator('#city-cat-chat')).toBeVisible();
  await expect(page.locator('#city-rest-cat')).toHaveCount(0);
  await expect(page.locator('#city-wait')).toHaveCount(0);
  await page.locator('#city-tab-cats').click();
  await expect(page.locator('#fish-rest')).toHaveCount(0);
  await expect(page.locator('#invite-pepper')).toBeVisible();
  await expect(page.locator('#time-forward')).toHaveCount(0);
});

test('a selected cat walks only through an explicit action; apartments list 入住 per cat', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await ready(page);
  await clickTile(page, 3, 4);
  await page.locator('[data-build-type=CAT_APARTMENT]').click();
  await page.locator('#city-tab-cats').click();
  await page.locator('#invite-pepper').click();
  await page.locator('#river-tools-close').click();
  const before = await readWorld(page);
  const mochi = before.cats[0]!;
  await clickTile(page, mochi.position.x, mochi.position.y);
  await expect(page.locator('#city-selection-label')).toContainText('Mochi');
  // Tapping land opens its card with the walk as one clearly named action.
  await clickTile(page, 4, 4);
  await expect(page.locator('#city-selection-label')).toContainText('空地');
  await expect(page.locator('#walk-here')).toHaveText('让 Mochi 走到这里');
  await expect(page.locator('[data-build-type=CAT_CAFE]')).toBeVisible();
  expect(await readWorld(page)).toEqual(before);
  await page.locator('#walk-here').click();
  const walking = await readWorld(page);
  expect(walking.cats[0]!.walk!.destination).toEqual({ x: 4, y: 4 });
  await expect(page.locator('#city-selection-label')).toContainText('Mochi');
  await expect(page.locator('#city-wait')).toBeVisible();
  // A building ignores the selected cat: its card lists every cat directly.
  await clickTile(page, 3, 4);
  await expect(page.locator('#walk-here')).toHaveCount(0);
  await expect(page.locator('#assign-home-mochi')).toHaveText('Mochi 入住');
  const pepper = walking.cats[1]!;
  await expect(page.locator(`#assign-home-${pepper.id}`)).toHaveText(
    'Pepper 入住',
  );
  await page.locator(`#assign-home-${pepper.id}`).click();
  expect((await readWorld(page)).cats[1]!.home).toBe(walking.buildings[0]!.id);
  await expect(page.locator(`#assign-home-${pepper.id}`)).toBeDisabled();
  await expect(page.locator('#city-action-reason')).toContainText('已经住');
});

test('outing lists waterways with their conditions; chat has no second fishing entry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await ready(page);
  await page.locator('#city-tab-cats').click();
  await expect(page.getByRole('button', { name: /去钓鱼/ })).toHaveCount(0);
  await page.locator('#city-tab-outing').click();
  await expect(page.locator('#city-tab-outing')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  const spots = page.locator('[data-outing-spot]');
  await expect(spots).toHaveCount(4);
  await expect(page.locator('#city-panel-outing')).toContainText('家门口池塘');
  await expect(page.locator('#city-panel-outing')).toContainText('钓技');
  const before = await readWorld(page);
  await page.locator('[data-outing-spot="REEDS"]').click();
  await expect(page.locator('#river-tools')).toBeHidden();
  await expect(page.locator('#city-selection-label')).toContainText('芦苇河湾');
  await expect(page.locator('#walk-to-waterway')).toBeDisabled();
  await expect(page.locator('#city-action-reason')).toContainText('钓技');
  expect(await readWorld(page)).toEqual(before);
  await page.locator('#city-tab-outing').click();
  await page.locator('[data-outing-spot="POND"]').click();
  await expect(page.locator('#begin-fishing')).toBeVisible();
  // Pepper is invited from the cats page, never from the river roster.
  await page.locator('#begin-fishing').click();
  await expect(page.locator('#visit-river')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#invite-pepper')).toBeHidden();
});
