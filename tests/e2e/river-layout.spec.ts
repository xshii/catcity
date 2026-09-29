import { interact } from '../helpers/world';
import { enterRiver } from '../../harness/adapters/catcity/city-input';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import {
  closeRiverPanel,
  openBag,
  openCats,
  openChat,
  openGear,
  showFish,
} from '../../harness/adapters/catcity/navigation';
import { createWorld } from '../../src/core';
import { greenZone } from '../../src/minigames/angling';
import { moodBadge } from '../../src/view/shell/mood';

async function onScreen(control: Locator) {
  await expect(control).toBeVisible();
  await expect(control).toBeInViewport({ ratio: 1 });
}
async function singleScreen(page: Page) {
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    panels: [
      'river-tools',
      'river-panel-gear',
      'river-panel-bag',
      'river-panel-atlas',
      'panel-cats',
      'city-panel-guide',
      'city-panel-outing',
    ]
      .map((id) => document.getElementById(id)!)
      .filter((element) => element.getClientRects().length)
      .map((element) => ({
        id: element.id,
        height: element.clientHeight,
        content: element.scrollHeight,
      })),
    scene: (() => {
      const box = document
        .getElementById('fishing-stage')!
        .getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    })(),
  }));
  // The scene fills the viewport; the bars float over it (spec 031).
  expect(layout.scene).toEqual({
    x: 0,
    y: 0,
    width: layout.width,
    height: layout.height,
  });
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.width);
  expect(layout.documentHeight).toBeLessThanOrEqual(layout.height);
  for (const panel of layout.panels)
    expect(
      panel.content,
      `${panel.id} must not require vertical scrolling`,
    ).toBeLessThanOrEqual(panel.height + 1);
}

async function cityNavigation(page: Page) {
  await onScreen(page.locator('#city-tools-nav'));
  await expect(page.locator('#city-tools-nav button')).toHaveCount(3);
  for (const [id, label] of [
    ['guide', '指引'],
    ['cats', '猫咪'],
    ['outing', '出游'],
  ] as const) {
    await onScreen(page.locator(`#city-tab-${id}`));
    await expect(page.locator(`#city-tab-${id}`)).toContainText(label);
  }
  await expect(page.locator('#river-tools-nav')).toBeHidden();
  await expect(page.locator('#river-tools')).toBeHidden();
  const before = await readWorld(page);
  await page.locator('#city-tab-guide').click();
  await expect(page.locator('#city-tab-guide')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await onScreen(page.locator('#city-panel-guide'));
  await onScreen(page.locator('#city-action'));
  await onScreen(page.locator('#save'));
  await singleScreen(page);
  await expect(page.locator('#visit-city')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await readWorld(page)).toEqual(before);
  await closeRiverPanel(page);
  await page.locator('#city-tab-cats').click();
  await onScreen(page.locator('#panel-cats'));
  await onScreen(page.locator('#invite-pepper'));
  await onScreen(page.locator('[data-cat-id="mochi"]'));
  // Spec 032: the band from Core in words as well as a face, and the hint when happy.
  const badge = moodBadge(before.cats.find((cat) => cat.id === 'mochi')!.mood);
  const card = page.locator('[data-cat-id="mochi"]');
  await expect(card.locator('.mood-line')).toHaveText(badge.text);
  await expect(card.locator('.mood-line')).toHaveAttribute(
    'aria-label',
    badge.label,
  );
  await expect(card.locator('.mood-hint')).toHaveText(badge.hint);
  await expect(card.locator('.mood-hint')).toBeVisible({
    visible: !!badge.hint,
  });
  await page.locator('[data-cat-id="mochi"]').click();
  await singleScreen(page);
  await expect(page.locator('#visit-city')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await readWorld(page)).toEqual(before);
  await openChat(page);
  await expect(page.locator('#city-tab-cats')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await onScreen(page.getByLabel('和 Mochi 说句话'));
  await expect(page.locator('#mood')).toHaveAttribute(
    'aria-label',
    badge.label,
  );
  await expect(page.locator('#mood-hint')).toBeVisible({
    visible: !!badge.hint,
  });
  await expect(page.locator('#visit-city')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#river-tools-nav')).toBeHidden();
  expect(await readWorld(page)).toEqual(before);
  await singleScreen(page);
  await closeRiverPanel(page);
  await onScreen(page.locator('#city-overview'));

  // Outing lists the waterways and locates one. Cats must walk to shore before changing scene.
  await page.locator('#city-tab-guide').click();
  await page.locator('#city-tab-outing').click();
  await onScreen(page.locator('#city-panel-outing'));
  for (const spot of ['POND', 'REEDS', 'MOON', 'COAST'])
    await onScreen(page.locator(`[data-outing-spot="${spot}"]`));
  await singleScreen(page);
  await page.locator('[data-outing-spot="POND"]').click();
  await expect(page.locator('#visit-city')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await onScreen(page.locator('#city-action-card'));
  await expect(page.locator('#river-tools')).toBeHidden();
  expect(await readWorld(page)).toEqual(before);
  await page.locator('#visit-city').click();
  await onScreen(page.locator('#city-tools-nav'));
  await expect(page.locator('#river-tools-nav')).toBeHidden();
  await expect(page.locator('#river-tools')).toBeHidden();
  await expect(page.locator('#city-tab-guide')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.locator('#city-tab-cats')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(await readWorld(page)).toEqual(before);
  await singleScreen(page);
}
function stockedSave() {
  const world = createWorld(42);
  for (let cast = 0; cast < 5; cast++) {
    expect(
      world.dispatch({
        type: 'FISH_BEGIN',
        catId: 'mochi',
        baitId: 'BREAD',
        direction: -30,
        spotId: 'POND',
        aimDepth: 50,
      }).ok,
    ).toBe(true);
    for (
      let tick = 0;
      tick < 600 && world.getSnapshot().fishing.active;
      tick++
    ) {
      const run = world.getSnapshot().fishing.active!;
      const zone = greenZone(run);
      const pressed =
        run.phase === 'charge'
          ? run.tick < 23
          : run.phase === 'hook'
            ? run.cursor >= zone.low && run.cursor <= zone.high
            : run.phase === 'fight' && run.tension < (zone.low + zone.high) / 2;
      expect(
        world.dispatch({
          type: 'FISH_CONTROL',
          runId: run.id,
          pressed,
          ticks: 1,
        }).ok,
      ).toBe(true);
    }
  }
  expect(world.getSnapshot().fishing.inventory).toHaveLength(5);
  return world.save();
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
]) {
  test(`phone ${viewport.width}×${viewport.height} keeps city, river and paged tools on one screen`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await ready(page);
    if (viewport.width === 360)
      await page.evaluate(
        (save) => window.CAT_CITY_DEBUG!.loadFixture({ save }),
        stockedSave(),
      );
    await singleScreen(page);
    await onScreen(page.locator('#city-overview'));
    await cityNavigation(page);
    await page.screenshot({
      path: testInfo.outputPath('city-phone.png'),
      fullPage: true,
    });
    await enterRiver(page);
    // Cat cards live in the cats panel, not in the river scene (spec 031).
    await openCats(page);
    await onScreen(page.locator('[data-cat-id="mochi"]'));
    await page.locator('[data-cat-id="mochi"]').click();
    await singleScreen(page);
    await closeRiverPanel(page);
    await onScreen(page.locator('#cast-start'));
    await expect(page.locator('.cat-card')).toBeHidden();
    await expect(page.locator('#fish-location')).toBeHidden();
    await expect(page.locator('#fish-inventory')).toBeHidden();
    await expect(page.locator('#atlas-list')).toBeHidden();
    await expect(page.locator('#river-tools-nav button')).toHaveCount(4);
    await expect(page.locator('#city-tools-nav')).toBeHidden();
    const before = await readWorld(page);
    await openGear(page);
    for (const id of [
      'fish-location',
      'fish-companion',
      'fish-bait',
      'fish-direction',
      'fish-depth',
      'travel-duration',
      'travel-to-spot',
    ])
      await onScreen(page.locator(`#${id}`));
    await singleScreen(page);
    await openGear(page, 'supplies');
    await onScreen(page.locator('[data-buy-bait="WORM"]'));
    await onScreen(page.locator('#haptics-toggle'));
    await onScreen(page.locator('#sound-toggle'));
    await singleScreen(page);
    await openGear(page, 'info');
    await onScreen(page.locator('#companion-specialty'));
    await onScreen(page.locator('#spot-unlocks'));
    await singleScreen(page);
    await openBag(page);
    await onScreen(page.locator('#fish-tastes'));
    if (viewport.width === 360) {
      const fish = before.fishing.inventory;
      await onScreen(page.locator(`[data-gift-fish="${fish[0]!.id}"]`));
      await onScreen(page.locator('#bag-next'));
      await expect(page.locator('#bag-prev')).toBeDisabled();
      await page.locator('#bag-next').click();
      await onScreen(page.locator(`[data-gift-fish="${fish[4]!.id}"]`));
      await expect(
        page.locator(`[data-gift-fish="${fish[0]!.id}"]`),
      ).toBeHidden();
      await expect(page.locator('#bag-next')).toBeDisabled();
      await singleScreen(page);
      await page.locator('#bag-prev').click();
      await onScreen(page.locator(`[data-gift-fish="${fish[0]!.id}"]`));
    }
    await singleScreen(page);
    await openBag(page, 'supplies');
    await onScreen(page.locator('#fish-supplies'));
    await onScreen(page.locator('#use-can'));
    await onScreen(page.locator('#recycle-trash'));
    await singleScreen(page);
    await showFish(page, 'SILVER');
    await onScreen(page.locator('[data-species="SILVER"]'));
    await page.locator('#atlas-next').click();
    await onScreen(page.locator('[data-species="CRUCIAN"]'));
    await page.locator('#atlas-prev').click();
    await onScreen(page.locator('[data-species="SILVER"]'));
    await showFish(page, 'MOON_CARP');
    await onScreen(page.locator('[data-species="MOON_CARP"]'));
    await singleScreen(page);
    await openChat(page);
    await onScreen(page.getByLabel('和 Mochi 说句话'));
    await onScreen(page.getByRole('button', { name: '发送', exact: true }));
    await singleScreen(page);
    await page.screenshot({
      path: testInfo.outputPath('panel-phone.png'),
      fullPage: true,
    });
    await openChat(page, 'memory');
    await onScreen(page.locator('.journal'));
    await singleScreen(page);
    await closeRiverPanel(page);
    expect(await readWorld(page)).toEqual(before);
    await expect(page.locator('.cat-card')).toBeHidden();
    await page.screenshot({
      path: testInfo.outputPath('river-phone.png'),
      fullPage: true,
    });

    await page.locator('#cast-start').click();
    await onScreen(page.locator('#fish-control'));
    await page.locator('#fish-control').focus();
    await page.keyboard.down('Space');
    await expect
      .poll(async () =>
        Number(
          await page.locator('#angling-bar').getAttribute('aria-valuenow'),
        ),
      )
      .toBeGreaterThan(10);
    await page.keyboard.up('Space');
    await openGear(page);
    const paused = await readWorld(page);
    await page.waitForTimeout(300);
    expect(await readWorld(page)).toEqual(paused);
    await closeRiverPanel(page);
    await expect(page.locator('#fish-pause')).toHaveText('继续钓鱼');
    await page.locator('#fish-pause').click();
    await expect
      .poll(async () => (await readWorld(page)).fishing.active!.tick)
      .toBeGreaterThan(paused.fishing.active!.tick);
    await page.locator('#visit-city').click();
    await onScreen(page.locator('#city-tools-nav'));
    await expect(page.locator('#river-tools-nav')).toBeHidden();
    await expect(page.locator('#river-tools')).toBeHidden();
    const away = await readWorld(page);
    await page.waitForTimeout(300);
    expect(await readWorld(page)).toEqual(away);
    await singleScreen(page);
    await enterRiver(page);
    await expect(page.locator('#fish-pause')).toHaveText('继续钓鱼');
    await onScreen(page.locator('#fish-control'));
    await singleScreen(page);
    await page.locator('#fish-cancel').click();
    expect(errors).toEqual([]);
  });
}

test('desktop scenes fill the window and the cats panel slides in from the right', async ({
  page,
}, testInfo) => {
  // Spec 031: no side column on desktop; the scene fills the window like on phones.
  const viewport = { width: 1280, height: 800 };
  await page.setViewportSize(viewport);
  await page.goto('/');
  await ready(page);
  await cityNavigation(page);
  await page.screenshot({
    path: testInfo.outputPath('city-desktop.png'),
    fullPage: true,
  });
  await enterRiver(page);
  await singleScreen(page);
  await expect(page.locator('.cat-card')).toBeHidden();
  await onScreen(page.locator('#cast-start'));
  await openGear(page);
  await onScreen(page.locator('#fish-location'));
  await singleScreen(page);
  await closeRiverPanel(page);
  await openChat(page);
  await onScreen(page.getByLabel('和 Mochi 说句话'));
  // The drawer: 400px at the right edge, inside the bars' 8px gutter, the scene to its left.
  const drawer = (await page.locator('#river-tools').boundingBox())!;
  const gutter = viewport.width - (drawer.x + drawer.width);
  expect(gutter).toBeGreaterThanOrEqual(0);
  expect(gutter).toBeLessThanOrEqual(9);
  expect(Math.abs(drawer.width - 400)).toBeLessThanOrEqual(1);
  await singleScreen(page);
  await page.screenshot({
    path: testInfo.outputPath('cats-desktop.png'),
    fullPage: true,
  });
  await closeRiverPanel(page);
  await page.screenshot({
    path: testInfo.outputPath('river-desktop.png'),
    fullPage: true,
  });
  await singleScreen(page);
});

test('saved long dialogue reloads as accessible pages without overflowing the phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const reply = '今天我们沿着小路走到池塘边，安静地看着水里的波纹。'.repeat(11);
  const world = createWorld(42);
  expect(interact(world, 'mochi', '记住今天的散步。', reply).ok).toBe(true);
  await page.addInitScript(
    (save) => localStorage.setItem('cat-city.save.v1', save),
    world.save(),
  );
  await page.goto('/');
  await ready(page);
  for (let reload = 0; reload < 2; reload++) {
    if (reload) {
      await page.reload();
      await ready(page);
    }
    await openChat(page);
    if (await page.locator('#meet-cat').isVisible())
      await page.locator('#meet-cat').click();
    await expect(page.getByTestId('dialogue')).toHaveText(
      Array.from(reply).slice(0, 100).join(''),
    );
    let accessibleReply = await page.getByTestId('dialogue').innerText();
    while (await page.locator('#chat-reply-next').isEnabled()) {
      await onScreen(page.locator('#chat-reply-next'));
      await page.locator('#chat-reply-next').click();
      accessibleReply += await page.getByTestId('dialogue').innerText();
      await singleScreen(page);
      await onScreen(page.getByLabel('和 Mochi 说句话'));
    }
    expect(accessibleReply).toBe(reply);
    expect((await readWorld(page)).cats[0]!.memories.at(-1)!.reply).toBe(reply);
  }
});
