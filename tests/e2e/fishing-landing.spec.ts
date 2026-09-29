import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { expect, test } from '@playwright/test';
import { createWorld } from '../../src/core';
import { greenZone } from '../../src/minigames/angling';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';

function landingSave() {
  const world = createWorld(42);
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
  for (let tick = 0; tick < 1000; tick++) {
    const run = world.getSnapshot().fishing.active!;
    expect(run).not.toBeNull();
    if (run.phase === 'fight' && run.progress >= 95) return world.save();
    const zone = greenZone(run);
    const pressed =
      run.phase === 'charge'
        ? run.tick < 23
        : run.phase === 'hook'
          ? run.cursor >= zone.low && run.cursor <= zone.high
          : run.phase === 'fight' && run.tension < (zone.low + zone.high) / 2;
    expect(
      world.dispatch({ type: 'FISH_CONTROL', runId: run.id, pressed, ticks: 1 })
        .ok,
    ).toBe(true);
  }
  throw new Error('Fixture must reach the last part of a valid fight');
}

test('releasing a held touch after landing cannot click through into a second cast', async ({
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
  try {
    // This phone plays the button flow; without a choice it would be offered motion.
    await page.addInitScript((save) => {
      localStorage.setItem('cat-city.save.v1', save);
      localStorage.setItem('cat-city.fishing-input', 'buttons');
    }, landingSave());
    await page.goto(`${localOrigin(testPorts().test)}/`);
    await ready(page);
    const before = await readWorld(page);
    const control = page.locator('#fish-control');
    await expect(control).toBeInViewport({ ratio: 1 });
    const point = await control.evaluate((element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const touch = await context.newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [point],
    });
    await expect
      .poll(async () => (await readWorld(page)).fishing.active, {
        timeout: 5000,
      })
      .toBeNull();
    const landed = await readWorld(page);
    expect(landed.fishing.inventory).toHaveLength(1);
    expect(landed.cats[0]!.needs.energy).toBe(before.cats[0]!.needs.energy);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(await readWorld(page)).toEqual(landed);
    await expect(page.locator('#angling-live')).toBeHidden();
    // A new, intentional touch still starts exactly one next cast.
    await page.locator('#cast-start').tap();
    expect((await readWorld(page)).fishing.active!.phase).toBe('charge');
    // Preparing is free; stamina is paid when the cast is released.
    expect((await readWorld(page)).cats[0]!.needs.energy).toBe(
      landed.cats[0]!.needs.energy,
    );
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
