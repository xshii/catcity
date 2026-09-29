import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import { pettingTastes } from '../../src/core';
import { PET_SPOTS, type PetSpot } from '../../src/content/petting';

// Spec 039: one whole round of petting by touch, on a phone.

const SHOTS = 'artifacts/petting';
const spot = (page: Page, id: PetSpot) => page.locator(`[data-spot="${id}"]`);
const cat = (page: Page) => page.locator('#petting-cat');

/** A finger put down on one spot and drawn across the cat to another. */
async function drag(page: Page, from: PetSpot, to: PetSpot) {
  const centre = async (id: PetSpot) => {
    const box = (await spot(page, id).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const [start, end] = [await centre(from), await centre(to)];
  const touch = await page.context().newCDPSession(page);
  const send = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: { x: number; y: number }[],
  ) => touch.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await send('touchStart', [start]);
  try {
    const steps = 6;
    for (let step = 1; step <= steps; step++)
      await send('touchMove', [
        {
          x: start.x + ((end.x - start.x) * step) / steps,
          y: start.y + ((end.y - start.y) * step) / steps,
        },
      ]);
  } finally {
    await send('touchEnd', []);
    await touch.detach();
  }
}

test('a round of petting by touch settles in Core and shows its result', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await mkdir(SHOTS, { recursive: true });
  try {
    await page.goto(`${localOrigin(testPorts().test)}/`);
    await ready(page);
    const before = await readWorld(page);
    const mochi = before.cats[0]!;
    const { favourite, disliked } = pettingTastes(before.seed, mochi.id);
    const [plain, other] = PET_SPOTS.filter(
      (id) => id !== favourite && id !== disliked,
    );

    await page.locator('#city-tab-cats').tap();
    await expect(page.locator('#pet-cat')).toHaveText('摸摸 Mochi');
    await page.locator('#pet-cat').tap();
    await expect(page.locator('#petting')).toBeVisible();
    // Nothing of the cat's tastes shows before it was touched.
    await expect(page.locator('.petting-spot[data-known="true"]')).toHaveCount(
      0,
    );

    // Slow strokes on the favourite spot, each as the purr swells.
    for (let stroke = 0; stroke < 3; stroke++) {
      await expect(cat(page)).toHaveAttribute('data-purr', 'true');
      await spot(page, favourite).tap();
      await expect(cat(page)).toHaveAttribute('data-purr', 'false');
    }
    await expect(spot(page, favourite)).toHaveAttribute('data-known', 'true');
    await expect(cat(page)).toHaveAttribute('data-purr', 'true');
    await spot(page, favourite).tap();
    await expect(page.locator('#petting-bubble')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/round-390x844.png` });

    // One finger drawn from one plain spot to the other strokes both.
    await drag(page, plain!, other!);
    await expect(spot(page, plain!)).toHaveAttribute('data-known', 'true');
    await expect(spot(page, other!)).toHaveAttribute('data-known', 'true');

    await expect(cat(page)).toHaveAttribute('data-away', 'false');
    await page.waitForTimeout(400);
    await spot(page, disliked).tap();
    await expect(cat(page)).toHaveAttribute('data-away', 'true');
    await expect(page.locator('#petting-hint')).toHaveText(
      'Mochi 躲开了，等它回来',
    );
    await page.screenshot({ path: `${SHOTS}/pull-away-390x844.png` });
    await expect(cat(page)).toHaveAttribute('data-away', 'false');

    // The round ends by itself after its twelve seconds.
    await expect(page.locator('#petting-result')).toBeVisible({
      timeout: 15_000,
    });
    const layout = await page.evaluate(() => ({
      scroll: document.documentElement.scrollHeight,
      height: window.innerHeight,
      width: document.documentElement.scrollWidth,
    }));
    expect(layout.scroll).toBeLessThanOrEqual(layout.height);
    expect(layout.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: `${SHOTS}/result-390x844.png` });

    const last = await page.evaluate(() =>
      window.CAT_CITY_DEBUG!.getDiagnostics().recentCommands.at(-1)!,
    );
    expect(last.command.type).toBe('PET_CAT');
    if (last.command.type !== 'PET_CAT' || !last.result.ok)
      throw new Error('The round was not settled');
    const strokes = last.command.strokes.map((stroke) => stroke.spot);
    expect(strokes.slice(0, 4)).toEqual(Array(4).fill(favourite));
    expect(strokes).toEqual(expect.arrayContaining([plain, other, disliked]));
    const petted = last.result.events[0]!;
    if (petted.type !== 'CatPetted') throw new Error('No petting event');
    expect(petted.mood).toBeGreaterThanOrEqual(2);
    expect(petted.spot).toBe(favourite);
    await expect(page.locator('#petting-change')).toHaveText(
      `心情 +${petted.mood}`,
    );
    const after = (await readWorld(page)).cats[0]!;
    expect(after.mood).toBe(mochi.mood + petted.mood);
    expect(after.petting.discovered).toEqual([...PET_SPOTS]);
    expect(after.petting.rounds).toBe(1);
    expect(after.needs.energy).toBe(mochi.needs.energy);

    // What was found out stays after a reload, in the cats panel.
    await page.locator('#petting-done').tap();
    await expect(page.locator('#petting')).toBeHidden();
    await page.reload();
    await ready(page);
    expect((await readWorld(page)).cats[0]!.petting).toEqual(after.petting);
    await page.locator('#city-tab-cats').tap();
    await expect(page.locator('#pet-cat-known')).toContainText('最喜欢');
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
