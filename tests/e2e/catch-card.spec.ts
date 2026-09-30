import { expect, test, type Page } from '@playwright/test';
import { catchFish } from '../../harness/adapters/catcity/angling-input';
import { ready } from '../../harness/adapters/catcity/browser';
import { enterRiver } from '../../harness/adapters/catcity/city-input';
import { CATCH_CARD_MS } from '../../src/view/fishing/screen';

/** The page goes to the background or comes back, as the browser would say. */
const pageHidden = (page: Page, hidden: boolean) =>
  page.evaluate((hidden) => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

for (const viewport of [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
])
  test(`phone ${viewport.width}×${viewport.height}: the catch card counts down along its bottom edge and closes at a tap (R-02)`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() =>
      localStorage.setItem('cat-city.fishing-input', 'buttons'),
    );
    await page.goto('/');
    await ready(page);
    await enterRiver(page);
    await page.locator('#cast-start').click();
    await catchFish(page);
    const card = page.locator('#catch-reveal');
    const bar = card.locator('.catch-countdown');
    await expect(card).toBeVisible();
    // The card pops in (fading from transparent); the picture waits until it has.
    await card.evaluate((element) =>
      Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      ),
    );
    // In the background the countdown waits, so the picture is taken at half time.
    await pageHidden(page, true);
    await expect(card).toHaveAttribute('data-countdown', 'held');
    const duration = await bar.evaluate((element, half) => {
      const [animation] = element.getAnimations();
      if (!animation) return null;
      animation.currentTime = half;
      return animation.effect?.getTiming().duration ?? null;
    }, CATCH_CARD_MS / 2);
    expect(duration).toBe(CATCH_CARD_MS);
    // 3px along the card's bottom edge, inside its 1px border, half of it left.
    const cardBox = (await card.boundingBox())!;
    const barBox = (await bar.boundingBox())!;
    const near = (actual: number, expected: number) =>
      expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
    near(barBox.height, 3);
    near(barBox.x, cardBox.x + 1);
    near(barBox.y + barBox.height, cardBox.y + cardBox.height - 1);
    near(barBox.width, (cardBox.width - 2) / 2);
    await page.screenshot({
      path: testInfo.outputPath(
        `catch-countdown-${viewport.width}x${viewport.height}.png`,
      ),
    });
    // With less motion the bar stands still.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await bar.evaluate((element) => element.getAnimations().length),
    ).toBe(0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await pageHidden(page, false);
    await expect(card).toHaveAttribute('data-countdown', 'running');
    // A tap anywhere on the card closes it: nothing over it takes the tap.
    await card.click();
    await expect(card).toBeHidden();
  });
