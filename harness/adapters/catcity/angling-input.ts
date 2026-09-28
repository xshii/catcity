import { expect, type Page } from '@playwright/test';

/** Real-time polling interval and the View's tick length in milliseconds. */
const POLL_MS = 25;
const TICK_MS = 50;

/** Ticks of the active run, read from the bridge or, in production, the saved world. */
async function runTick(page: Page): Promise<number> {
  return page.evaluate(() => {
    const world = window.CAT_CITY_DEBUG
      ? window.CAT_CITY_DEBUG.getWorldState()
      : (
          JSON.parse(localStorage.getItem('cat-city.save.v1') ?? 'null') as {
            world: { fishing: { active: { tick: number } | null } };
          } | null
        )?.world;
    return world?.fishing.active?.tick ?? 0;
  });
}

/**
 * Game-time control for fishing drivers. `manual` steps ticks explicitly through the
 * test-build bridge (like ADVANCE_TIME for the city) to remove races in short windows.
 * Each manual tick costs page round trips plus a full render, so long fights use real
 * time, where the driver reacts in parallel with the ticks. Production has no bridge.
 */
export async function fishingClock(page: Page, requestManual = true) {
  const manual = await page.evaluate((wanted) => {
    const bridge = window.CAT_CITY_DEBUG;
    bridge?.useManualFishingClock(wanted);
    return wanted && !!bridge;
  }, requestManual);
  return {
    manual,
    /** Let `ticks` fishing ticks pass. */
    advance: async (ticks: number) => {
      if (manual)
        await page.evaluate(
          (n) => window.CAT_CITY_DEBUG!.stepFishing(n),
          ticks,
        );
      else await page.waitForTimeout(ticks * TICK_MS);
    },
    /** Advance `stride` ticks at a time until `done`, failing after `maxTicks`. */
    until: async (
      done: () => Promise<boolean>,
      maxTicks: number,
      stride = 1,
    ) => {
      if (!manual) {
        // Budget in game ticks, not wall time: slow machines tick below 20 Hz.
        const start = await runTick(page);
        for (;;) {
          if (await done()) return;
          const elapsed = (await runTick(page)) - start;
          if (elapsed > maxTicks)
            throw new Error(
              `Fishing condition not met within ${maxTicks} ticks`,
            );
          await page.waitForTimeout(POLL_MS);
        }
      }
      for (let tick = 0; tick <= maxTicks; tick += stride) {
        if (await done()) return;
        await page.evaluate(
          (n) => window.CAT_CITY_DEBUG!.stepFishing(n),
          stride,
        );
      }
      throw new Error(`Fishing condition not met within ${maxTicks} ticks`);
    },
    release: async () => {
      if (manual)
        await page.evaluate(() =>
          window.CAT_CITY_DEBUG?.useManualFishingClock(false),
        );
    },
  };
}

/** Hold/release against the visible tension meter until the fight settles. */
async function reelIn(
  page: Page,
  clock: Awaited<ReturnType<typeof fishingClock>>,
  hold: (next: boolean) => Promise<void>,
) {
  const bar = page.locator('#angling-bar');
  // A fight lasts at most FISHING.fight.maxTicks (420) ticks.
  for (
    let n = 0;
    n < 420 && (await page.locator('#angling-live').isVisible());
    n++
  ) {
    const state = await bar.evaluate((element) => ({
      value: Number(element.getAttribute('aria-valuenow')),
      low: Number(element.dataset.low),
      high: Number(element.dataset.high),
    }));
    await hold(state.value < (state.low + state.high) / 2);
    // Decide every tick when stepping; in real time, poll faster than the View ticks.
    if (clock.manual) await clock.advance(1);
    else await page.waitForTimeout(POLL_MS);
  }
  await hold(false);
  await expect(page.locator('#angling-live')).toBeHidden();
  await expect(page.locator('#fish-result')).toContainText('钓到了');
}

/** Drive real keyboard/touch inputs, observing the same visible meters as a player. */
export async function catchFish(
  page: Page,
  mode: 'keyboard' | 'touch' = 'keyboard',
  observePhase?: (phase: string) => Promise<void>,
) {
  const button = page.locator('#fish-control');
  const bar = page.locator('#angling-bar');
  await expect(button).toBeInViewport({ ratio: 1 });
  await button.focus();
  const clock = await fishingClock(page, false);
  const touch =
    mode === 'touch' ? await page.context().newCDPSession(page) : null;
  let held = false;
  const hold = async (next: boolean) => {
    if (held === next) return;
    if (touch) {
      // Resolve each real touch target from the current viewport.
      const point = next
        ? await button.evaluate((element) => {
            if (!element.getClientRects().length) return null;
            const bounds = element.getBoundingClientRect();
            if (bounds.top < 0 || bounds.bottom > innerHeight)
              throw new Error(
                'Fishing control must fit on screen without scrolling',
              );
            return {
              x: bounds.x + bounds.width / 2,
              y: bounds.y + bounds.height / 2,
            };
          })
        : null;
      // Settlement may hide the control after the meter read; never wait on it.
      if (next && !point) return;
      await touch.send('Input.dispatchTouchEvent', {
        type: next ? 'touchStart' : 'touchEnd',
        touchPoints: point ? [point] : [],
      });
    } else if (next) await page.keyboard.down('Space');
    else await page.keyboard.up('Space');
    held = next;
  };
  const meter = () =>
    bar.evaluate((element) => ({
      phase: element.dataset.phase,
      value: Number(element.getAttribute('aria-valuenow')),
      low: Number(element.dataset.low),
      high: Number(element.dataset.high),
    }));
  try {
    const initial = await meter();
    await observePhase?.(initial.phase ?? 'unknown');
    if (initial.phase === 'charge') {
      await hold(true);
      await clock.until(async () => (await meter()).value >= 65, 80);
      await hold(false);
    } else if ((await page.locator('#fish-pause').textContent()) === '继续钓鱼')
      await page.locator('#fish-pause').click();
    await clock.until(async () => (await meter()).phase === 'hook', 100);
    await observePhase?.('hook');
    await clock.until(async () => {
      const state = await meter();
      return state.value >= state.low + 6 && state.value <= state.high - 6;
    }, 80);
    await hold(true);
    await clock.until(async () => (await meter()).phase === 'fight', 30);
    await observePhase?.('fight');
    await reelIn(page, clock, hold);
    await observePhase?.('ready');
  } finally {
    if (!page.isClosed()) {
      await hold(false);
      await touch?.detach();
      await clock.release();
    }
  }
}
