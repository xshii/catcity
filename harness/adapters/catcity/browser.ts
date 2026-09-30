import { BOND, CARE } from '../../../src/content/care';
import {
  BUILDINGS,
  buildingPrice,
  CAFE,
  CITY_START,
} from '../../../src/content/city';
import { cityLoopCoins } from '../../tasks/city-loop';
import { catchFish } from './angling-input';
import assert from 'node:assert/strict';
import { expect, type Page } from '@playwright/test';
import type { ReplayRecord } from '../../../src/application';
import type { CatCityDebug } from '../../../src/debug/bridge';
import { clickTile, reachWaterway } from './city-input';
import { shoreTiles, samePosition, tileAt } from '../../../src/core/city';
import { createWorld } from '../../../src/core/world';
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
/**
 * A production page starts a new game with the stray and the cat maker (spec 041 T-14).
 * Checks about something else begin from a saved new game instead: written before the
 * page loads, and kept when it reloads.
 */
export async function savedNewGame(page: Page) {
  await page.addInitScript((save) => {
    if (localStorage.getItem('cat-city.save.v1') === null)
      localStorage.setItem('cat-city.save.v1', save);
  }, createWorld(42).save());
}

export async function ready(page: Page) {
  await page.waitForFunction(() => window.CAT_CITY_DEBUG?.version === 1);
  await expect(page.locator('canvas')).toBeVisible();
}
export const readWorld = (page: Page) =>
  page.evaluate(() => window.CAT_CITY_DEBUG!.getWorldState());
/** The whole city is paid when the game clock reaches a multiple of this. */
const INTERVAL = BUILDINGS.CAT_CAFE.intervalMinutes;
/** Payouts since the run's cafe was built, at the start of the game. */
const paymentsSinceStart = (minute: number) =>
  Math.floor(minute / INTERVAL) - Math.floor(CITY_START.minute / INTERVAL);
const {
  afterLand: AFTER_LAND,
  afterRoad: AFTER_ROAD,
  afterHome: AFTER_HOME,
  built: BUILT,
  payment: PAYMENT,
  fishSold: FISH_SOLD,
} = cityLoopCoins;

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
        assert.equal(world.coins, CITY_START.coins);
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
        await expect(page.getByTestId('coins')).toHaveText(String(AFTER_LAND));
        await page.locator('#place-road').click();
        await page.locator('#upgrade-road').click();
        const tile = (await readWorld(page)).map.tiles.find(
          (item) => item.position.x === 2 && item.position.y === 5,
        )!;
        assert.equal(tile.owned, true);
        assert.equal(tile.road, 'STONE');
        assert.equal((await readWorld(page)).coins, AFTER_ROAD);
      });
      await step('apartment-and-home', async () => {
        await clickTile(page, 4, 6);
        await page.locator('[data-build-type="CAT_APARTMENT"]').click();
        await page.locator('#assign-home-mochi').click();
        const world = await readWorld(page);
        assert.equal(world.coins, AFTER_HOME);
        assert.equal(world.cats[0]!.home, world.buildings[0]!.id);
      });
      await step('build-cafe', async () => {
        await clickTile(page, 4, 4);
        await expect(page.locator('[data-build-type="CAT_CAFE"]')).toHaveText(
          `猫咖 · ${buildingPrice('CAT_CAFE', 0)}`,
        );
        await page.locator('[data-build-type="CAT_CAFE"]').click();
        await expect(page.getByTestId('coins')).toHaveText(String(BUILT));
        // Mochi's home is two tiles away: the cafe has its customer.
        await expect(page.locator('#city-action-detail')).toContainText(
          `客人 1/${CAFE.seats} · 每 ${INTERVAL / 60} 小时 ${PAYMENT} 金币 · Mochi`,
        );
        const world = await readWorld(page);
        assert.equal(world.buildings.length, 2);
        assert.equal(world.buildings[1]!.type, 'CAT_CAFE');
        assert.deepEqual(world.buildings[1]!.position, { x: 4, y: 4 });
      });
      await step('move-building', async () => {
        await page.locator('#move-building').click();
        // Moving is free; the new plot is still within range of Mochi's home.
        await clickTile(page, 6, 6);
        const world = await readWorld(page);
        assert.deepEqual(world.buildings[1]!.position, { x: 6, y: 6 });
        assert.equal(world.coins, BUILT);
        assert.equal(world.buildings.length, 2);
      });
      await step('income', async () => {
        // The guide says who the cafe serves and when the city is paid next; the test
        // build's clock is advanced explicitly.
        await page.locator('#city-tab-guide').click();
        await expect(page.locator('#cafe-income')).toContainText(
          `客人 1/${CAFE.seats} · 每 ${INTERVAL / 60} 小时 ${PAYMENT} 金币 · 距离下次结算 ${INTERVAL - (CITY_START.minute % INTERVAL)} 游戏分钟`,
        );
        await page.locator('#river-tools-close').click();
        await page.evaluate(
          (minutes) => window.CAT_CITY_DEBUG!.advanceTime(minutes),
          INTERVAL,
        );
        await expect(page.getByTestId('coins')).toHaveText(
          String(BUILT + PAYMENT),
        );
        assert.equal(
          (await readWorld(page)).minute,
          CITY_START.minute + INTERVAL,
        );
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
        assert.deepEqual(await readWorld(page), before);
        await page.locator('#walk-here').click();
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
        // One energy per tile; the last 10-minute wait may add one idle recovery tick
        // after arriving (beside the home apartment at most).
        const energy = arrived.cats[0]!.needs.energy;
        assert.ok(
          energy >= 100 - steps && energy <= 100 - steps + CARE.recovery.home,
          `energy ${energy} after ${steps} steps`,
        );
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
        assert.equal(cat.playerBond, BOND.chat);
      });
      await step('shared-outing', async () => {
        await page.locator('#city-tab-outing').click();
        await page.locator('[data-outing-spot="POND"]').click();
        await expect(page.locator('#visit-city')).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        const walkingFrom = await readWorld(page);
        await reachWaterway(page);
        const arrived = await readWorld(page);
        assert.ok(arrived.minute > walkingFrom.minute);
        // The walk costs one energy per tile; the waits may add idle recovery after it.
        const from = walkingFrom.cats[0]!;
        const to = arrived.cats[0]!;
        const tiles =
          Math.abs(to.position.x - from.position.x) +
          Math.abs(to.position.y - from.position.y);
        assert.ok(tiles > 0, 'the cat walked to the shore');
        const recovered =
          Math.ceil(
            (arrived.minute - walkingFrom.minute) / CARE.recovery.tickMinutes,
          ) * CARE.recovery.home;
        assert.ok(
          to.needs.energy <=
            Math.min(100, from.needs.energy - tiles + recovered),
          `energy ${to.needs.energy} after at least ${tiles} tiles`,
        );
        await page.locator('#begin-fishing').click();
        await expect(page.locator('#cast-start')).toBeVisible();
        assert.deepEqual(await readWorld(page), arrived);
        await page.locator('#cast-start').click();
        // Preparing is free; stamina is paid when the cast is released.
        assert.equal(
          (await readWorld(page)).cats[0]!.needs.energy,
          arrived.cats[0]!.needs.energy,
        );
        await catchFish(page);
        await openChat(page, 'memory');
        await expect(page.locator('#memory-fact')).toContainText('银鱼');
        await expect(page.locator('#memory-fact')).toBeVisible();
        const world = await readWorld(page);
        assert.equal(
          world.coins,
          BUILT + paymentsSinceStart(world.minute) * PAYMENT,
        );
        assert.equal(world.fishing.inventory.length, 1);
        assert.equal(world.cats[0]!.fishingMemory!.speciesId, 'SILVER');
        await openBag(page);
        await page.locator('[data-sell-fish]').click();
        assert.equal((await readWorld(page)).coins, world.coins + FISH_SOLD);
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
        // Never caught: its stars and where it lives, nothing more (2026-09-30).
        await expect(page.locator('[data-species="MOON_CARP"]')).toContainText(
          '未发现的鱼影',
        );
        await expect(
          page.locator('[data-species="MOON_CARP"]'),
        ).not.toContainText('仅限英短猫同行');
        await openGear(page, 'info');
        await expect(page.locator('#companion-specialty')).toContainText(
          '布偶猫',
        );
        await closeRiverPanel(page);
      });
      await step('cat-recovery-clock', async () => {
        // An idle cat recovers by itself on the city clock; nothing to press.
        const before = await readWorld(page);
        assert.ok(before.cats[0]!.needs.energy < 100);
        // One payment interval: exactly one payout of the city falls in it.
        await page.evaluate(
          (minutes) => window.CAT_CITY_DEBUG!.advanceTime(minutes),
          INTERVAL,
        );
        const recovered = await readWorld(page);
        assert.equal(recovered.minute, before.minute + INTERVAL);
        assert.equal(recovered.cats[0]!.needs.energy, 100);
        assert.equal(recovered.coins, before.coins + PAYMENT);
        // The silver fish was sold in between.
        assert.equal(
          recovered.coins,
          BUILT + FISH_SOLD + paymentsSinceStart(recovered.minute) * PAYMENT,
        );
      });
      await step('save-reload', async () => {
        await page.locator('#visit-city').click();
        await page.locator('#city-tab-guide').click();
        await page.getByRole('button', { name: '保存进度' }).click();
        await page.locator('#river-tools-close').click();
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
