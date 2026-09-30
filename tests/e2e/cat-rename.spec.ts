import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { localOrigin, testPorts } from '../../harness/runner/test-ports';
import { readWorld, ready } from '../../harness/adapters/catcity/browser';

// Spec 041 T-25 (R-16, ui-design 5.4 and 8): renaming Mochi by touch on a phone. What the
// name box shows is tested on the view rig (tests/view/name-dialog.test.ts); this checks
// real taps, the layout with the field focused, the save across a reload, and takes the
// box's screenshots as it opens and with the field focused (the keyboard's state).

const SHOTS = 'artifacts/T-25';
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
] as const;

for (const size of PHONES) {
  const name = `${size.width}x${size.height}`;
  test(`a suggested name renames Mochi and stays after a reload, on a ${name} phone`, async ({
    browser,
  }) => {
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
    await mkdir(SHOTS, { recursive: true });
    try {
      await page.goto(`${localOrigin(testPorts().test)}/`);
      await ready(page);
      await page.locator('#city-tab-cats').tap();
      await page.locator('[data-cat-details="mochi"]').tap();
      await page.locator('#profile-rename').tap();
      const box = page.locator('#name-dialog');
      await expect(box).toBeVisible();
      const field = page.locator('#name-input');
      await expect(field).toHaveValue('Mochi');
      // It opens with the keyboard down: the field has no focus.
      await expect(field).not.toBeFocused();
      for (const id of ['#name-input', '#name-suggestions', '#name-confirm'])
        await expect(page.locator(id)).toBeInViewport({ ratio: 1 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({ path: `${SHOTS}/name-box-${name}.png` });

      const chip = page.locator('#name-suggestions [role="radio"]').nth(1);
      const chosen = (await chip.textContent())!;
      await chip.tap();
      await expect(field).toHaveValue(chosen);
      await expect(chip).toHaveAttribute('aria-checked', 'true');
      // The field focused, as when the keyboard is up: confirm stays in view. A real
      // keyboard only shows on a phone.
      await field.tap();
      await expect(field).toBeFocused();
      await expect(page.locator('#name-confirm')).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: `${SHOTS}/name-box-typing-${name}.png` });

      await page.locator('#name-confirm').tap();
      await expect(box).toHaveCount(0);
      await expect(page.locator('#profile-name')).toContainText(chosen);
      await page.locator('#profile-back').tap();
      const row = page.locator('[data-cat-id="mochi"] strong');
      await expect(row).toHaveText(chosen);

      await page.reload();
      await ready(page);
      expect((await readWorld(page)).cats[0]!.name).toBe(chosen);
      await page.locator('#city-tab-cats').tap();
      await expect(row).toHaveText(chosen);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
