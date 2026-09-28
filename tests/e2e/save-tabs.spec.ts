import { expect, test } from '@playwright/test';
import { ready } from '../../harness/adapters/catcity/browser';

test('a newer save from another tab stops this tab from overwriting it', async ({
  context,
}) => {
  const first = await context.newPage();
  await first.goto('/');
  await ready(first);
  const second = await context.newPage();
  await second.goto('/');
  await ready(second);
  // The second tab makes progress and saves it.
  await second.evaluate(() => window.CAT_CITY_DEBUG!.advanceTime(30));
  const newer = await second.evaluate(() =>
    localStorage.getItem('cat-city.save.v1'),
  );
  await expect(first.locator('#storage-error')).toContainText('另一个标签页');
  await expect(first.locator('#reset-demo')).toBeHidden();
  // The stale tab keeps playing locally but never writes over the newer save.
  await first.evaluate(() => window.CAT_CITY_DEBUG!.advanceTime(5));
  await first.locator('#city-tab-guide').click();
  await first.locator('#save').click();
  expect(
    await first.evaluate(() => localStorage.getItem('cat-city.save.v1')),
  ).toBe(newer);
});
