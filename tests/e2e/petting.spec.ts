import { mkdir } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';
import { pettingTastes } from '../../src/core';
import { PETTING, PET_SPOTS, type PetSpot } from '../../src/content/petting';

const { purr: PURR, meter: METER } = PETTING;

// Spec 039 and 041 T-05 (ui-design 5.5): petting by touching the cat itself, on a phone.

/** ui-design 8: the task's screenshots, at both phone sizes. */
const SHOTS = 'artifacts/T-05';
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
] as const;
/** A cell of the bar at the bottom: the keyboard's and screen reader's way to a spot. */
const cell = (page: Page, id: PetSpot) =>
  page.locator(`#petting-bar [data-spot="${id}"]`);
/** A spot's touch region on the cat; nothing marks it until it is touched. */
const region = (page: Page, id: PetSpot) =>
  page.locator(`#petting-regions [data-region="${id}"]`);
const cat = (page: Page) => page.locator('#petting-cat');

async function centre(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A finger put down on the cat at one spot and drawn across it to another. */
async function drag(page: Page, from: PetSpot, to: PetSpot) {
  const [start, end] = [
    await centre(region(page, from)),
    await centre(region(page, to)),
  ];
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

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

/** The boxes of the screen's parts that are shown, read in one page call. */
const boxes = (page: Page, parts: Record<string, string>) =>
  page.evaluate((parts) => {
    const read: Record<string, Box | null> = {};
    for (const [name, selector] of Object.entries(parts)) {
      const element = document.querySelector(selector);
      if (!element || element.closest('[hidden]')) read[name] = null;
      else {
        const { x, y, width, height } = element.getBoundingClientRect();
        read[name] = { x, y, width, height };
      }
    }
    return {
      read,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
    };
  }, parts);

/**
 * Every named part is shown, inside the screen, and none overlaps another; the `within`
 * parts need only be shown and inside the screen.
 */
async function laidOut(
  page: Page,
  parts: Record<string, string>,
  within: Record<string, string> = {},
) {
  const { read, viewport, scroll } = await boxes(page, { ...parts, ...within });
  expect(scroll.width).toBeLessThanOrEqual(viewport.width);
  expect(scroll.height).toBeLessThanOrEqual(viewport.height);
  for (const [name, box] of Object.entries(read)) {
    expect(box, `${name} is shown`).not.toBeNull();
    expect(box!.x, name).toBeGreaterThanOrEqual(0);
    expect(box!.y, name).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, name).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height, name).toBeLessThanOrEqual(viewport.height);
  }
  const apart = Object.keys(parts);
  for (const [index, name] of apart.entries())
    for (const other of apart.slice(index + 1))
      expect(overlap(read[name]!, read[other]!), `${name} and ${other}`).toBe(
        false,
      );
}
/** While a round goes: the hint above the cat, the reaction below, the bar at the bottom. */
const ROUND = {
  heading: '.petting-heading',
  meter: '#petting-meter-row',
  hint: '#petting-hint',
  cat: '#petting-cat',
  bubble: '#petting-bubble',
  bar: '#petting-bar',
};

async function openPetting(page: Page) {
  await page.goto(`${localOrigin(testPorts().test)}/`);
  await ready(page);
  await page.evaluate(() => window.CAT_CITY_DEBUG!.useManualPettingClock(true));
  await page.locator('#city-tab-cats').tap();
  await expect(page.locator('#pet-cat')).toHaveText('摸摸 Mochi');
  await page.locator('#pet-cat').tap();
  await expect(page.locator('#petting')).toBeVisible();
  await expect(page.locator('#clock-speed')).toBeDisabled();
  return (ticks: number) =>
    page.evaluate((count) => window.CAT_CITY_DEBUG!.stepPetting(count), ticks);
}

async function phone(
  browser: import('@playwright/test').Browser,
  size: { width: number; height: number },
) {
  const context = await browser.newContext({
    viewport: size,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return { context, page, errors };
}

test('a round of petting by touching the cat settles in Core and shows its result', async ({
  browser,
}) => {
  const { context, page, errors } = await phone(browser, PHONES[0]);
  await mkdir(SHOTS, { recursive: true });
  try {
    const step = await openPetting(page);
    const before = await readWorld(page);
    const mochi = before.cats[0]!;
    const { favourite, disliked } = pettingTastes(before.seed, mochi.id);
    const [plain, other] = PET_SPOTS.filter(
      (id) => id !== favourite && id !== disliked,
    );
    // Nothing of the cat's tastes shows before it was touched.
    await expect(page.locator('#petting-bar [data-known="true"]')).toHaveCount(
      0,
    );
    await expect(cell(page, favourite)).toContainText('?');

    // Real touches on the cat, then one on the bar; the round's clock is stepped, so
    // each lands on a known tick.
    for (let stroke = 0; stroke < 3; stroke++) {
      await expect(cat(page)).toHaveAttribute('data-purr', 'true');
      await (
        stroke < 2 ? region(page, favourite) : cell(page, favourite)
      ).tap();
      // The touched spot glows on the cat and in the bar.
      await expect(region(page, favourite)).toHaveAttribute(
        'data-glow',
        'favourite',
      );
      await expect(cell(page, favourite)).toHaveAttribute(
        'data-touched',
        'true',
      );
      if (stroke < 2)
        expect(await step(PURR.periodTicks)).toBe(PURR.periodTicks);
    }
    await expect(cell(page, favourite)).toHaveAttribute('data-known', 'true');
    await expect(page.locator('#petting-bubble')).toHaveText('呼噜呼噜♪');
    await laidOut(page, ROUND);
    await page.screenshot({ path: `${SHOTS}/round-390x844.png` });
    await step(PURR.periodTicks);

    // One finger drawn from one plain spot to the other strokes both.
    await drag(page, plain!, other!);
    await expect(cell(page, plain!)).toHaveAttribute('data-known', 'true');
    await expect(cell(page, other!)).toHaveAttribute('data-known', 'true');
    await step(PURR.periodTicks);

    await region(page, disliked).tap();
    await expect(cat(page)).toHaveAttribute('data-away', 'true');
    await expect(page.locator('#petting-hint')).toHaveText(
      'Mochi 躲开了，等它回来',
    );
    // Pulled away, the cat stays whole on the screen.
    await laidOut(page, ROUND, { body: '.petting-body' });
    await page.screenshot({ path: `${SHOTS}/pull-away-390x844.png` });
    await step(PETTING.awayTicks);
    await expect(cat(page)).toHaveAttribute('data-away', 'false');

    // The rest of the twelve seconds runs out by itself, in real time.
    await page.evaluate(() =>
      window.CAT_CITY_DEBUG!.useManualPettingClock(false),
    );
    await expect(page.locator('#petting-result')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('#petting-bar')).toBeHidden();
    await laidOut(page, {
      heading: '.petting-heading',
      cat: '#petting-cat',
      result: '#petting-result',
    });
    await page.screenshot({ path: `${SHOTS}/result-390x844.png` });

    const last = await page.evaluate(() =>
      window.CAT_CITY_DEBUG!.getDiagnostics().recentCommands.at(-1)!,
    );
    expect(last.command.type).toBe('PET_CAT');
    if (last.command.type !== 'PET_CAT' || !last.result.ok)
      throw new Error('The round was not settled');
    expect(last.command.strokes).toEqual([
      { tick: 0, spot: favourite },
      { tick: PURR.periodTicks, spot: favourite },
      { tick: PURR.periodTicks * 2, spot: favourite },
      { tick: PURR.periodTicks * 3, spot: plain },
      { tick: PURR.periodTicks * 3, spot: other },
      { tick: PURR.periodTicks * 4, spot: disliked },
    ]);
    const petted = last.result.events[0]!;
    if (petted.type !== 'CatPetted') throw new Error('No petting event');
    expect(petted).toMatchObject({
      spot: favourite,
      meter:
        METER.favourite.purring * 3 +
        METER.neutral.purring * 2 -
        METER.disliked,
      mood: 3,
      full: true,
    });
    await expect(page.locator('#petting-change')).toHaveText(
      `心情 +${petted.mood}`,
    );
    const after = (await readWorld(page)).cats[0]!;
    expect(after.mood).toBe(mochi.mood + petted.mood);
    expect(after.petting.discovered).toEqual([...PET_SPOTS]);
    expect(after.petting.lifted).toHaveLength(1);
    expect(after.needs.energy).toBe(mochi.needs.energy);

    // What was found out stays after a reload, in the cats panel; the clock is free again.
    await page.locator('#petting-done').tap();
    await expect(page.locator('#petting')).toBeHidden();
    await expect(page.locator('#clock-speed')).toBeEnabled();
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

test('the petting screen fits a small phone: a round, the cat pulled away, the result', async ({
  browser,
}) => {
  const size = PHONES[1];
  const { context, page, errors } = await phone(browser, size);
  await mkdir(SHOTS, { recursive: true });
  const name = `${size.width}x${size.height}`;
  try {
    const step = await openPetting(page);
    const { favourite, disliked } = pettingTastes(
      (await readWorld(page)).seed,
      'mochi',
    );
    await region(page, favourite).tap();
    await expect(page.locator('#petting-bubble')).toHaveText('呼噜呼噜♪');
    await laidOut(page, ROUND);
    await page.screenshot({ path: `${SHOTS}/round-${name}.png` });
    await step(PURR.periodTicks);
    await region(page, disliked).tap();
    await expect(cat(page)).toHaveAttribute('data-away', 'true');
    await laidOut(page, ROUND, { body: '.petting-body' });
    await page.screenshot({ path: `${SHOTS}/pull-away-${name}.png` });
    await step(PETTING.roundTicks);
    await expect(page.locator('#petting-result')).toBeVisible();
    await laidOut(page, {
      heading: '.petting-heading',
      cat: '#petting-cat',
      result: '#petting-result',
    });
    await page.screenshot({ path: `${SHOTS}/result-${name}.png` });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
