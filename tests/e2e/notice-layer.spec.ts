import { expect, test, type Page } from '@playwright/test';
import { catchFish } from '../../harness/adapters/catcity/angling-input';
import { enterRiver } from '../../harness/adapters/catcity/city-input';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import {
  closeRiverPanel,
  openCats,
  openGear,
  showBagFish,
} from '../../harness/adapters/catcity/navigation';
import { progressSaves } from '../helpers/fishing-progress';

type Box = { x: number; y: number; width: number; height: number };

/**
 * What is drawn on top at the middle of the notice. The notice never takes a tap, so
 * hit-testing skips it: for this one reading it is made hittable, which changes nothing
 * about the order things are painted in.
 */
const onTopAtNotice = (page: Page) =>
  page.locator('#notice').evaluate((notice) => {
    notice.style.pointerEvents = 'auto';
    const box = notice.getBoundingClientRect();
    const top = document.elementFromPoint(
      box.x + box.width / 2,
      box.y + box.height / 2,
    );
    notice.style.pointerEvents = '';
    return top?.id || top?.tagName || null;
  });

const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

/** Every control of the open panel and of the bars around it. */
const PANEL_CONTROLS = [
  '#river-tools button',
  '#river-tools select',
  '#river-tools input',
  '#map-heading button',
  '.scene-tools-nav button',
];

/** The notice is in the viewport and over none of the open panel's controls. */
async function clearOfControls(page: Page, controls: string[]) {
  const notice = page.locator('#notice');
  await expect(notice).toBeInViewport({ ratio: 1 });
  const box = (await notice.boundingBox())!;
  for (const selector of controls)
    for (const control of await page.locator(selector).all()) {
      if (!(await control.isVisible())) continue;
      expect(
        overlap(box, (await control.boundingBox())!),
        `the notice must not cover ${selector}`,
      ).toBe(false);
    }
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
]) {
  test(`phone ${viewport.width}×${viewport.height}: a notice raised under an open panel shows over it, off its controls`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.addInitScript((save) => {
      localStorage.setItem('cat-city.save.v1', save);
      localStorage.setItem('cat-city.fishing-input', 'buttons');
    }, progressSaves().reedsOpen);
    await page.goto('/');
    await ready(page);
    await enterRiver(page);
    const fish = (await readWorld(page)).fishing.inventory[0]!;
    await showBagFish(page, fish.id);
    await page.locator(`[data-gift-fish="${fish.id}"]`).click();
    await expect(page.locator('#notice')).toContainText('Mochi');
    expect(await onTopAtNotice(page)).toBe('notice');
    await clearOfControls(page, PANEL_CONTROLS);
    await page.screenshot({ path: testInfo.outputPath('gift-notice.png') });

    // The cats panel, shared by both scenes: a chat's notice.
    await openCats(page, 'talk');
    await page.locator('[data-message="今天很开心"]').click();
    await expect(page.locator('#notice')).toContainText('回应了你');
    expect(await onTopAtNotice(page)).toBe('notice');
    await clearOfControls(page, PANEL_CONTROLS);
    await page.screenshot({ path: testInfo.outputPath('chat-notice.png') });

    await openGear(page, 'supplies');
    await page.locator('[data-buy-bait="WORM"]').click();
    await expect(page.locator('#notice')).toHaveText('鱼饵已放进包里。');
    expect(await onTopAtNotice(page)).toBe('notice');
    await clearOfControls(page, PANEL_CONTROLS);

    // The city's panels are the same sheet.
    await closeRiverPanel(page);
    await page.locator('#visit-city').click();
    await page.locator('#city-tab-guide').click();
    await page.locator('#save').click();
    await expect(page.locator('#notice')).toHaveText('进度已保存在这台设备。');
    expect(await onTopAtNotice(page)).toBe('notice');
    await clearOfControls(page, PANEL_CONTROLS);

    // With the panel closed the notice is back under the scene bar.
    await closeRiverPanel(page);
    const bar = (await page.locator('#map-heading').boundingBox())!;
    const notice = (await page.locator('#notice').boundingBox())!;
    expect(notice.y).toBeGreaterThan(bar.y + bar.height);
    expect(notice.y).toBeLessThan(viewport.height / 2);
  });
}

test('the catch card shows without a notice over it', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem('cat-city.fishing-input', 'buttons'),
  );
  await page.goto('/');
  await ready(page);
  await enterRiver(page);
  await page.locator('#cast-start').click();
  await catchFish(page);
  await expect(page.locator('#catch-reveal')).toBeVisible();
  // A fresh notice, raised from a panel over the card.
  await openGear(page, 'supplies');
  await page.locator('[data-buy-bait="WORM"]').click();
  await expect(page.locator('#notice')).toBeVisible();
  await closeRiverPanel(page);
  await expect(page.locator('#catch-reveal')).toBeVisible();
  await expect(page.locator('#notice')).toHaveText('鱼饵已放进包里。');
  await expect(page.locator('#notice')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('catch-card.png') });
  // The next cast takes the card away and says its own notice.
  await page.locator('#cast-start').click();
  await expect(page.locator('#catch-reveal')).toBeHidden();
  await expect(page.locator('#notice')).toBeVisible();
});

test('picking a cat says it can also be lifted and dragged, clear of the hint and the card', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await ready(page);
  const cat = (await readWorld(page)).cats[0]!;
  const at = await page.evaluate(
    (position) => window.CAT_CITY_DEBUG!.getTileScreenPosition(position),
    cat.position,
  );
  await page.mouse.click(at!.x, at!.y);
  await expect(page.locator('#city-action-card')).toBeVisible();
  await expect(page.locator('#notice')).toHaveText(
    '已选中 Mochi：点一块地，在卡片上选「让 Mochi 走到这里」；也可以长按猫咪，拖到想去的地方。',
  );
  await clearOfControls(page, [
    '#map-heading',
    '.city-map-hint',
    '#city-action-card',
    '.scene-tools-nav',
  ]);
  await page.screenshot({ path: testInfo.outputPath('cat-selected.png') });
});
