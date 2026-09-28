import { expect, type Page } from '@playwright/test';

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
      await expect
        .poll(async () => (await meter()).value, {
          intervals: [25],
          timeout: 4000,
        })
        .toBeGreaterThanOrEqual(65);
      await hold(false);
    } else if ((await page.locator('#fish-pause').textContent()) === '继续钓鱼')
      await page.locator('#fish-pause').click();
    await expect
      .poll(async () => (await meter()).phase, {
        intervals: [25],
        timeout: 5000,
      })
      .toBe('hook');
    await observePhase?.('hook');
    await expect
      .poll(
        async () => {
          const state = await meter();
          return state.value >= state.low + 6 && state.value <= state.high - 6;
        },
        { intervals: [25], timeout: 4000 },
      )
      .toBe(true);
    await hold(true);
    await expect
      .poll(async () => (await meter()).phase, {
        intervals: [25],
        timeout: 1500,
      })
      .toBe('fight');
    await observePhase?.('fight');
    for (
      let n = 0;
      n < 280 && (await page.locator('#angling-live').isVisible());
      n++
    ) {
      const state = await meter();
      await hold(state.value < (state.low + state.high) / 2);
      await page.waitForTimeout(75);
    }
    await hold(false);
    await expect(page.locator('#angling-live')).toBeHidden();
    await expect(page.locator('#fish-result')).toContainText('钓到了');
    await observePhase?.('ready');
  } finally {
    if (!page.isClosed()) {
      await hold(false);
      await touch?.detach();
    }
  }
}
