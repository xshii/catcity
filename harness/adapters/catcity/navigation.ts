import { expect, type Page } from '@playwright/test';
import { enterRiver } from './city-input';

export type RiverPanel = 'gear' | 'bag' | 'atlas' | 'chat';

async function expandTab(page: Page, selector: string) {
  const tab = page.locator(selector);
  await expect(tab).toBeVisible();
  await expect(tab).toBeInViewport({ ratio: 1 });
  if ((await tab.getAttribute('aria-expanded')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-expanded', 'true');
}

/** Navigate through the same visible controls as a player. */
async function openRiverPanel(page: Page, panel: RiverPanel) {
  if (
    (await page.locator('#visit-river').getAttribute('aria-pressed')) !== 'true'
  ) {
    await closeRiverPanel(page);
    await enterRiver(page);
  }
  await expandTab(page, `#river-tab-${panel}`);
}

export async function closeRiverPanel(page: Page) {
  const close = page.locator('#river-tools-close');
  if (await close.isVisible()) await close.click();
  await expect(close).toBeHidden();
}

export async function openGear(
  page: Page,
  section: 'setup' | 'supplies' | 'info' = 'setup',
) {
  await openRiverPanel(page, 'gear');
  await page.locator(`#gear-tab-${section}`).click();
}

export async function openBag(
  page: Page,
  section: 'fish' | 'supplies' = 'fish',
) {
  await openRiverPanel(page, 'bag');
  await page.locator(`#bag-tab-${section}`).click();
}

export async function openChat(
  page: Page,
  section: 'talk' | 'memory' = 'talk',
) {
  if (
    (await page.locator('#visit-city').getAttribute('aria-pressed')) === 'true'
  )
    await expandTab(page, '#city-tab-chat');
  else await openRiverPanel(page, 'chat');
  await page.locator(`#chat-tab-${section}`).click();
}

export async function showBagFish(page: Page, fishId: string) {
  await openBag(page);
  const fish = page.locator(`[data-gift-fish="${fishId}"]`);
  while (await page.locator('#bag-prev').isEnabled())
    await page.locator('#bag-prev').click();
  for (let index = 0; index < 8 && !(await fish.isVisible()); index++) {
    if (!(await page.locator('#bag-next').isEnabled())) break;
    await page.locator('#bag-next').click();
  }
  await expect(fish).toBeVisible();
}

export async function showFish(page: Page, species: string) {
  await openRiverPanel(page, 'atlas');
  await page.locator('#atlas-species').selectOption(species);
  await expect(page.locator(`[data-species="${species}"]`)).toBeVisible();
}

/** Pepper is invited from the city's cats page; returns to the scene afterwards. */
export async function invitePepper(page: Page) {
  const river =
    (await page.locator('#visit-river').getAttribute('aria-pressed')) ===
    'true';
  await closeRiverPanel(page);
  if (river) await page.locator('#visit-city').click();
  await expandTab(page, '#city-tab-cats');
  await page.locator('#invite-pepper').click();
  await closeRiverPanel(page);
  if (river) await page.locator('#visit-river').click();
}
