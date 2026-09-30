import { clickTile, reachWaterway } from './city-input';
import { catchFish } from './angling-input';
import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LocalPublication } from '../../runner/local-publication';
import type { WorldState } from '../../../src/core';
import {
  buildingPrice,
  CITY_COSTS,
  CITY_START,
  landPrice,
} from '../../../src/content/city';
import { closeRiverPanel, openBag, openChat, showFish } from './navigation';

export async function productionSmoke(publication: LocalPublication) {
  const browser = await chromium.launch();
  const errors: string[] = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  let primaryFailure = false;
  let primaryError: unknown;
  let evidenceError: Error | undefined;
  try {
    await page.goto(publication.url);
    await expect(page.locator('canvas')).toBeVisible();
    expect(await page.evaluate(() => 'CAT_CITY_DEBUG' in window)).toBe(false);
    await clickTile(page, 2, 5);
    await page.locator('#buy-land').click();
    await page.locator('#place-road').click();
    await clickTile(page, 4, 4);
    await page.locator('[data-build-type=CAT_CAFE]').click();
    await expect(page.getByTestId('coins')).toHaveText(
      String(
        CITY_START.coins -
          landPrice({ x: 2, y: 5 }) -
          CITY_COSTS.placeRoad -
          buildingPrice('CAT_CAFE', 0),
      ),
    );
    await page.screenshot({
      path: join(publication.evidence, 'city.png'),
      fullPage: true,
    });
    await openChat(page);
    await page.getByRole('button', { name: '今天有点累', exact: true }).tap();
    await expect(page.getByTestId('dialogue')).toContainText('歇一会');
    await page.locator('#city-tab-outing').tap();
    await page.locator('[data-outing-spot="POND"]').tap();
    await reachWaterway(page);
    const fishingResources = () =>
      page.evaluate(() => {
        const save = localStorage.getItem('cat-city.save.v1');
        if (!save) throw new Error('Missing production save');
        const world = JSON.parse(save).world as WorldState;
        return {
          active: world.fishing.active,
          energy: world.cats[0]!.needs.energy,
          baits: world.fishing.baits,
        };
      });
    const arrived = await fishingResources();
    expect(arrived.active).toBeNull();
    await page.locator('#begin-fishing').click();
    await expect(page.locator('#cast-start')).toBeVisible();
    expect(await fishingResources()).toEqual(arrived);
    await page.locator('#cast-start').click();
    const prepared = await fishingResources();
    expect(prepared.active?.phase).toBe('charge');
    // Preparing is free; stamina is paid when the cast is released.
    expect(prepared.energy).toBe(arrived.energy);
    expect(prepared.baits).toEqual(arrived.baits);
    await page.locator('#fishing-stage').screenshot({
      path: join(publication.evidence, 'fishing-scene.png'),
    });
    await catchFish(page, 'touch');
    await page.locator('#fishing-stage').screenshot({
      path: join(publication.evidence, 'catch.png'),
    });
    await openBag(page);
    await page.locator('[data-gift-fish]').tap();
    await openChat(page, 'memory');
    await expect(page.locator('#memory-fact')).toContainText('银鱼');
    await page.reload();
    await openChat(page);
    await page.getByRole('button', { name: '聊聊我们的回忆' }).tap();
    await expect(page.getByTestId('dialogue')).toContainText('银鱼');
    await closeRiverPanel(page);
    await page.getByRole('button', { name: '河畔', exact: true }).tap();
    await showFish(page, 'MOON_CARP');
    await expect(page.locator('[data-species=MOON_CARP]')).toContainText(
      '仅限英短猫同行',
    );
    await page.screenshot({
      path: join(publication.evidence, 'atlas.png'),
      fullPage: true,
    });
    await closeRiverPanel(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } catch (error) {
    primaryFailure = true;
    primaryError = error;
  } finally {
    // This isolated automation browser is observable even when an assertion fails.
    const collectSave = async () => {
      try {
        const save = await page.evaluate(() =>
          localStorage.getItem('cat-city.save.v1'),
        );
        await writeFile(
          join(publication.evidence, 'save.json'),
          save ?? 'null',
        );
      } catch (error) {
        await writeFile(join(publication.evidence, 'save.json'), 'null');
        throw error;
      }
    };
    const collected = await Promise.allSettled([
      page.screenshot({
        path: join(publication.evidence, 'mobile.png'),
        fullPage: true,
      }),
      writeFile(
        join(publication.evidence, 'console.json'),
        JSON.stringify(errors, null, 2),
      ),
      collectSave(),
    ]);
    const evidenceErrors = collected.flatMap((result, index) =>
      result.status === 'rejected'
        ? [
            `${['screenshot', 'console', 'save'][index]}: ${String(result.reason)}`,
          ]
        : [],
    );
    try {
      await browser.close();
    } catch (error) {
      evidenceErrors.push(`browser close: ${String(error)}`);
    }
    if (evidenceErrors.length) {
      await writeFile(
        join(publication.evidence, 'evidence-errors.json'),
        JSON.stringify(evidenceErrors, null, 2),
      ).catch(() => undefined);
      // A screenshot/storage failure must not replace the original gameplay failure.
      evidenceError = new Error(
        `Production evidence collection failed: ${evidenceErrors.join('; ')}`,
      );
    }
  }
  if (primaryFailure) throw primaryError;
  if (evidenceError) throw evidenceError;
}
