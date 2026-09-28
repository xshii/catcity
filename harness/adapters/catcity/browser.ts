import { catchFish } from './angling-input';
import assert from 'node:assert/strict';
import { expect, type Page } from '@playwright/test';
import type { ReplayRecord } from '../../../src/application';
import type { CatCityDebug } from '../../../src/debug/bridge';
import { clickTile, reachWaterway } from './city-input';
import { shoreTiles, samePosition, tileAt } from '../../../src/core/city';
import type { GameAdapter } from '../../runner/contract';
import { replayWorld } from './replay-world';
import {
  closeRiverPanel,
  openBag,
  openChat,
  openGear,
  showFish,
} from './navigation';

declare global {
  interface Window {
    CAT_CITY_DEBUG?: CatCityDebug;
  }
}
export async function ready(page: Page) {
  await page.waitForFunction(() => window.CAT_CITY_DEBUG?.version === 1);
  await expect(page.locator('canvas')).toBeVisible();
}
export const readWorld = (page: Page) =>
  page.evaluate(() => window.CAT_CITY_DEBUG!.getWorldState());

export function createCatCityAdapter(): GameAdapter {
  let capturedReplay: ReplayRecord | undefined;
  return {
    async exercise(page, step) {
      await ready(page);
      await page.evaluate(() =>
        window.CAT_CITY_DEBUG!.loadFixture({ seed: 42 }),
      );
      await step('initial-world', async () => {
        const world = await readWorld(page);
        assert.equal(world.coins, 1000);
        assert.equal(world.seed, 42);
        assert.equal(world.cats[0]!.name, 'Mochi');
        assert.ok(
          shoreTiles(world.map, 'POND').some((position) =>
            samePosition(position, world.cats[0]!.position),
          ),
        );
        assert.equal(tileAt(world.map, world.cats[0]!.position)?.owned, false);
        assert.equal(world.cats[0]!.fishingSpotId, 'POND');
      });
      await step('land-and-road', async () => {
        await clickTile(page, 2, 5);
        await page.locator('#buy-land').click();
        await expect(page.getByTestId('coins')).toHaveText('950');
        await page.locator('#place-road').click();
        await page.locator('#upgrade-road').click();
        const tile = (await readWorld(page)).map.tiles.find(
          (item) => item.position.x === 2 && item.position.y === 5,
        )!;
        assert.equal(tile.owned, true);
        assert.equal(tile.road, 'STONE');
        assert.equal((await readWorld(page)).coins, 920);
      });
      await step('apartment-and-home', async () => {
        await clickTile(page, 4, 6);
        await page.locator('[data-build-type="CAT_APARTMENT"]').click();
        await page.locator('#assign-home').click();
        const world = await readWorld(page);
        assert.equal(world.coins, 670);
        assert.equal(world.cats[0]!.home, world.buildings[0]!.id);
      });
      await step('build-cafe', async () => {
        await clickTile(page, 4, 4);
        await page.locator('[data-build-type="CAT_CAFE"]').click();
        await expect(page.getByTestId('coins')).toHaveText('370');
        const world = await readWorld(page);
        assert.equal(world.buildings.length, 2);
        assert.equal(world.buildings[1]!.type, 'CAT_CAFE');
        assert.deepEqual(world.buildings[1]!.position, { x: 4, y: 4 });
      });
      await step('move-building', async () => {
        await page.locator('#move-building').click();
        await clickTile(page, 6, 4);
        const world = await readWorld(page);
        assert.deepEqual(world.buildings[1]!.position, { x: 6, y: 4 });
        assert.equal(world.coins, 370);
        assert.equal(world.buildings.length, 2);
      });
      await step('income', async () => {
        await page.locator('#city-tab-build').click();
        await page
          .getByRole('button', { name: '营业一小时 · +10 金币' })
          .click();
        await expect(page.getByTestId('coins')).toHaveText('380');
        assert.equal((await readWorld(page)).minute, 60);
      });
      await step('select-cat', async () => {
        const cat = (await readWorld(page)).cats[0]!;
        await clickTile(page, cat.position.x, cat.position.y);
        await expect(page.locator('#cat-name')).toHaveText('Mochi');
        assert.equal(
          await page.evaluate(() => window.CAT_CITY_DEBUG!.getSelectedEntity()),
          'mochi',
        );
      });
      await step('cat-walking', async () => {
        const before = await readWorld(page);
        await clickTile(page, 4, 5);
        const started = await readWorld(page);
        assert.deepEqual(started.cats[0]!.walk!.destination, { x: 4, y: 5 });
        assert.deepEqual(started.cats[0]!.position, before.cats[0]!.position);
        assert.equal(started.cats[0]!.needs.energy, 100);
        const steps = started.cats[0]!.walk!.route.length;
        for (
          let count = 0;
          count < 20 && (await readWorld(page)).cats[0]!.walk;
          count++
        )
          await page.locator('#city-wait').click();
        const arrived = await readWorld(page);
        assert.deepEqual(arrived.cats[0]!.position, { x: 4, y: 5 });
        assert.equal(arrived.cats[0]!.needs.energy, 100 - steps);
        assert.equal(arrived.cats[0]!.walk, null);
      });
      await step('dialogue', async () => {
        await openChat(page);
        await page.getByLabel('和 Mochi 说句话').fill('你喜欢吃鱼吗？');
        await page.getByRole('button', { name: '发送' }).click();
        await expect(page.getByTestId('dialogue')).toContainText('鱼');
        const cat = (await readWorld(page)).cats[0]!;
        assert.equal(cat.memories.length, 1);
        assert.equal(cat.memories[0]!.message, '你喜欢吃鱼吗？');
        assert.equal(cat.playerBond, 1);
      });
      await step('shared-outing', async () => {
        await page.getByRole('button', { name: '邀请 Mochi 去钓鱼 ↗' }).click();
        await expect(page.locator('#visit-city')).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        const walkingFrom = await readWorld(page);
        await reachWaterway(page);
        const arrived = await readWorld(page);
        assert.ok(arrived.minute > walkingFrom.minute);
        assert.ok(
          arrived.cats[0]!.needs.energy < walkingFrom.cats[0]!.needs.energy,
        );
        await page.locator('#begin-fishing').click();
        await expect(page.locator('#cast-start')).toBeVisible();
        assert.deepEqual(await readWorld(page), arrived);
        await page.locator('#cast-start').click();
        assert.equal(
          (await readWorld(page)).cats[0]!.needs.energy,
          arrived.cats[0]!.needs.energy - 8,
        );
        await catchFish(page);
        await openChat(page, 'memory');
        await expect(page.locator('#memory-fact')).toContainText('银鱼');
        await expect(page.locator('#memory-fact')).toBeVisible();
        const world = await readWorld(page);
        assert.equal(world.coins, 370 + Math.floor(world.minute / 60) * 10);
        assert.equal(world.fishing.inventory.length, 1);
        assert.equal(world.cats[0]!.fishingMemory!.speciesId, 'SILVER');
        await openBag(page);
        await page.locator('[data-sell-fish]').click();
        assert.equal((await readWorld(page)).coins, world.coins + 8);
        await openChat(page);
        await page.getByRole('button', { name: '聊聊我们的回忆' }).click();
        await expect(page.getByTestId('dialogue')).toContainText('银鱼');
      });
      await step('atlas-and-breed', async () => {
        await showFish(page, 'SILVER');
        await expect(page.locator('[data-species="SILVER"]')).toContainText(
          '0 星',
        );
        await expect(page.locator('[data-species="SILVER"]')).toContainText(
          '鱼种最大长度：18.0 cm',
        );
        await expect(page.locator('[data-species="SILVER"]')).not.toContainText(
          '个人最长：尚无纪录',
        );
        await showFish(page, 'MOON_CARP');
        await expect(page.locator('[data-species="MOON_CARP"]')).toContainText(
          '★★★★★',
        );
        await expect(page.locator('[data-species="MOON_CARP"]')).toContainText(
          '仅限英短猫同行',
        );
        await openGear(page, 'info');
        await expect(page.locator('#companion-specialty')).toContainText(
          '布偶猫',
        );
        await closeRiverPanel(page);
      });
      await step('cat-rest-clock', async () => {
        const before = await readWorld(page);
        await page.locator('#fish-rest').click();
        const resting = await readWorld(page);
        assert.equal(resting.minute, before.minute);
        assert.equal(
          resting.cats[0]!.needs.energy,
          before.cats[0]!.needs.energy,
        );
        assert.equal(resting.cats[0]!.rest!.startedAt, before.minute);
        await page.locator('#time-forward').click();
        const recovered = await readWorld(page);
        assert.equal(recovered.minute, before.minute + 60);
        assert.equal(recovered.cats[0]!.needs.energy, 100);
        assert.equal(recovered.cats[0]!.rest, null);
        assert.equal(recovered.coins, before.coins + 10);
        assert.equal(
          recovered.coins,
          378 + Math.floor(recovered.minute / 60) * 10,
        );
      });
      await step('save-reload', async () => {
        await page.getByRole('button', { name: '保存进度' }).click();
        capturedReplay = await page.evaluate(() =>
          window.CAT_CITY_DEBUG!.getReplay(),
        );
        const before = await readWorld(page);
        await page.reload();
        await ready(page);
        assert.deepEqual(await readWorld(page), before);
        const cat = before.cats[0]!;
        await clickTile(page, cat.position.x, cat.position.y);
        await openChat(page);
        await expect(page.getByTestId('dialogue')).toContainText('鱼');
        await expect(page.locator('#reunion')).toContainText('第一次钓鱼');
        await openChat(page, 'memory');
        await expect(page.locator('#memory-fact')).toContainText('银鱼');
        await closeRiverPanel(page);
        await page.getByRole('button', { name: '河畔', exact: true }).click();
        await showFish(page, 'SILVER');
        await expect(page.locator('[data-species="SILVER"]')).toContainText(
          '0 星',
        );
        await closeRiverPanel(page);
      });
    },
    async collect(page) {
      const world = await readWorld(page);
      const commands =
        capturedReplay ??
        (await page.evaluate(() => window.CAT_CITY_DEBUG!.getReplay()));
      return {
        'world.json': world,
        'commands.json': commands,
        'fixture.json': JSON.parse(commands.initialSave) as unknown,
        'diagnostics.json': await page.evaluate(() =>
          window.CAT_CITY_DEBUG!.getDiagnostics(),
        ),
        'game-meta.json': {
          seed: world.seed,
          buildVersion: await page.evaluate(
            () => window.CAT_CITY_DEBUG!.buildVersion,
          ),
        },
      };
    },
    verifyReplay(evidence) {
      replayWorld(evidence['commands.json'] as ReplayRecord);
    },
  };
}
