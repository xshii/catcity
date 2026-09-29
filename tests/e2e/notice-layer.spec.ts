import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { catchFish } from '../../harness/adapters/catcity/angling-input';
import { enterRiver, settle } from '../../harness/adapters/catcity/city-input';
import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { FISHING } from '../../src/content/fishing';
import { WATER_VIEW } from '../../src/view/art/water-view';
import {
  askForSensors,
  phoneContext,
  seasoned,
  sensorsOn,
  spin,
} from '../helpers/motion-phone';
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
  // One reading of the page for all boxes: a round trip per control is slow on a busy
  // machine. Visible as Playwright means it: a box with an area, not styled out of sight.
  const { box, shown } = await page.evaluate((selectors) => {
    const boxOf = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      box: boxOf(document.querySelector('#notice')!),
      shown: selectors.flatMap((selector) =>
        Array.from(document.querySelectorAll(selector))
          .filter((control) => {
            const { width, height } = control.getBoundingClientRect();
            return (
              width > 0 &&
              height > 0 &&
              control.checkVisibility({ visibilityProperty: true })
            );
          })
          .map((control) => ({ selector, box: boxOf(control) })),
      ),
    };
  }, controls);
  // The check must have looked at something.
  expect(shown.length).toBeGreaterThan(0);
  for (const control of shown)
    expect(
      overlap(box, control.box),
      `the notice must not cover ${control.selector}`,
    ).toBe(false);
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

test('the catch card withdraws the standing notice and gives way to a later one', async ({
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
  // The cast's notice is withdrawn, not only faded.
  await expect(page.locator('#notice')).not.toBeEmpty();
  await expect(page.locator('#notice')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('catch-card.png') });
  // A notice raised while the card shows is not lost: the card goes.
  await openGear(page, 'supplies');
  await page.locator('[data-buy-bait="WORM"]').click();
  await closeRiverPanel(page);
  await expect(page.locator('#notice')).toHaveText('鱼饵已放进包里。');
  await expect(page.locator('#notice')).toBeVisible();
  await expect(page.locator('#catch-reveal')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('notice-after-card.png') });
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

/** What the river shows that a notice must keep off, by name. */
const RIVER_PARTS = {
  chip: '#river-place',
  gear: '#river-settings',
  plane: '#motion-fishing',
  legend: '#motion-legend',
  hint: '#motion-fishing-hint',
  card: '#catch-reveal',
  bar: '#map-heading',
};
/** Two lines of the notice's 11px text at 1.5, its padding, and a pixel of rounding. */
const TWO_LINES_PX = 2 * 11 * 1.5 + 8 + 1;

/**
 * The notice on the river, read in one page call: its box, the visible parts' boxes and
 * the canvas. The water, the fish shadows, the landing ring and the rod are drawn on the
 * canvas from its horizon down (`WATER_VIEW.horizonY`), across the screen.
 */
async function noticeOnRiver(page: Page, testInfo: TestInfo, name: string) {
  // The canvas is sized to the river a few frames after the scene switches.
  await settle(page);
  const read = await page.evaluate((parts) => {
    const boxOf = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const notice = document.querySelector('#notice')!;
    return {
      text: notice.textContent,
      notice: boxOf(notice),
      canvas: boxOf(document.querySelector('#game canvas')!),
      parts: Object.entries(parts).flatMap(([part, selector]) => {
        const element = document.querySelector(selector);
        if (!element) return [];
        const box = boxOf(element);
        return box.width > 0 &&
          box.height > 0 &&
          element.checkVisibility({ visibilityProperty: true })
          ? [{ part, box }]
          : [];
      }),
    };
  }, RIVER_PARTS);
  const horizon =
    read.canvas.y +
    (read.canvas.height * WATER_VIEW.horizonY) / WATER_VIEW.size;
  const water = {
    x: 0,
    y: horizon,
    width: page.viewportSize()!.width,
    height: read.canvas.y + read.canvas.height - horizon,
  };
  await writeFile(
    testInfo.outputPath(`${name}.json`),
    JSON.stringify({ ...read, water }, null, 2),
  );
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  expect(read.text, `${name}: a notice stands`).not.toBe('');
  await expect(page.locator('#notice')).toBeInViewport({ ratio: 1 });
  expect(read.parts.map(({ part }) => part)).toEqual(
    expect.arrayContaining(['chip', 'gear', 'bar']),
  );
  // Soft: one run reports every part a notice covers, in every phase.
  for (const { part, box } of [...read.parts, { part: 'water', box: water }])
    expect
      .soft(
        overlap(read.notice, box),
        `${name}: the notice must not cover the ${part}`,
      )
      .toBe(false);
  expect
    .soft(read.notice.height, `${name}: the notice takes at most two lines`)
    .toBeLessThanOrEqual(TWO_LINES_PX);
  return read;
}

const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
  // An iPhone's Safari with its bars showing: less height, so the water starts higher.
  { width: 390, height: 664 },
  { width: 375, height: 553 },
];

for (const viewport of PHONES) {
  test(`phone ${viewport.width}×${viewport.height}: on the river a notice keeps off the water, the rod and the scene chip (buttons)`, async ({
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
    await noticeOnRiver(page, testInfo, 'buttons-aim');
    // The longest notice the river says: a gift's, back on the river as the bag closes.
    const fish = (await readWorld(page)).fishing.inventory[0]!;
    await showBagFish(page, fish.id);
    await page.locator(`[data-gift-fish="${fish.id}"]`).click();
    await closeRiverPanel(page);
    await expect(page.locator('#notice')).toContainText('Mochi');
    await noticeOnRiver(page, testInfo, 'buttons-aim-gift');
    await page.locator('#cast-start').click();
    await catchFish(page, 'keyboard', async (phase) => {
      if (phase !== 'ready')
        await noticeOnRiver(page, testInfo, `buttons-${phase}`);
    });
    // The card withdrew the run's notice; a later one takes the card's place.
    await expect(page.locator('#catch-reveal')).toBeVisible();
    await expect(page.locator('#notice')).toBeHidden();
  });

  test(`phone ${viewport.width}×${viewport.height}: on the river a notice keeps off the water, the legend and the hint (motion)`, async ({
    browser,
  }, testInfo) => {
    const context = await phoneContext(browser, viewport);
    await askForSensors(context);
    await seasoned(context);
    const page = await context.newPage();
    await page.goto(`${localOrigin(testPorts().test)}/`);
    await ready(page);
    await enterRiver(page);
    await page.evaluate(() =>
      window.CAT_CITY_DEBUG!.useManualFishingClock(true),
    );
    await sensorsOn(page);
    await expect(page.locator('#motion-legend')).toBeVisible();
    const aiming = await noticeOnRiver(page, testInfo, 'motion-aim');
    expect(aiming.parts.map(({ part }) => part)).toEqual(
      expect.arrayContaining(['plane', 'legend', 'hint']),
    );
    // A quick flick down casts; the wait, the bite and the fight follow on the clock.
    await spin(page, [0, 300, 700, 900, 100, 0]);
    const phase = () =>
      page.evaluate(
        () => window.CAT_CITY_DEBUG!.getWorldState().fishing.active?.phase,
      );
    expect(await phase()).toBe('waiting');
    await noticeOnRiver(page, testInfo, 'motion-waiting');
    for (let tick = 0; tick < 200 && (await phase()) !== 'hook'; tick++)
      await page.evaluate(() => window.CAT_CITY_DEBUG!.stepFishing(1));
    expect(await phase()).toBe('hook');
    await noticeOnRiver(page, testInfo, 'motion-hook');
    await page.waitForTimeout(FISHING.motion.gesture.liftCooldownMs);
    await spin(page, [-400]);
    expect(await phase()).toBe('fight');
    await expect(page.locator('#motion-ring')).toBeVisible();
    await noticeOnRiver(page, testInfo, 'motion-fight');
    await context.close();
  });
}
