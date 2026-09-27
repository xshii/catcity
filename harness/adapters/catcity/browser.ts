import assert from 'node:assert/strict';
import { expect, type Page } from '@playwright/test';
import type { ReplayRecord } from '../../../src/application/session';
import type { CatCityDebug } from '../../../src/debug/bridge';
import { MAP_VIEW, tileCenter } from '../../../src/view/geometry';
import type { GameAdapter } from '../../runner/contract';
import { replayWorld } from './replay-world';

declare global {
  interface Window {
    CAT_CITY_DEBUG?: CatCityDebug;
  }
}
export async function ready(page: Page) {
  await page.waitForFunction(() => window.CAT_CITY_DEBUG?.version === 1);
  await expect(page.locator('canvas')).toBeVisible();
}
export async function clickTile(page: Page, x: number, y: number) {
  const canvas = page.locator('canvas');
  const bounds = await canvas.boundingBox();
  assert(bounds, 'Canvas must have bounds');
  const center = tileCenter(x, y);
  await canvas.click({
    position: {
      x: (center.x * bounds.width) / MAP_VIEW.size,
      y: (center.y * bounds.height) / MAP_VIEW.size,
    },
  });
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
      });
      await step('build-cafe', async () => {
        await clickTile(page, 4, 4);
        await expect(page.getByTestId('coins')).toHaveText('700');
        const world = await readWorld(page);
        assert.equal(world.buildings.length, 1);
        assert.equal(world.buildings[0]!.type, 'CAT_CAFE');
        assert.deepEqual(world.buildings[0]!.position, { x: 4, y: 4 });
      });
      await step('income', async () => {
        await page.getByRole('button', { name: /休息一小时/ }).click();
        await expect(page.getByTestId('coins')).toHaveText('710');
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
      await step('dialogue', async () => {
        await page.getByLabel('和 Mochi 说句话').fill('你喜欢吃鱼吗？');
        await page.getByRole('button', { name: '发送' }).click();
        await expect(page.getByTestId('dialogue')).toContainText('鱼');
        const cat = (await readWorld(page)).cats[0]!;
        assert.equal(cat.memories.length, 1);
        assert.equal(cat.memories[0]!.message, '你喜欢吃鱼吗？');
        assert.equal(cat.playerBond, 1);
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
        await expect(page.getByTestId('dialogue')).toContainText('鱼');
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
