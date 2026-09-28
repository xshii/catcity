import { expect, test } from '@playwright/test';
import { createServer, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { clickTile } from '../../harness/adapters/catcity/city-input';

// Serve the exact production build under a repository path, with no Vite
// fallback or root asset aliases that could conceal a broken Pages deployment.
const mount = '/catcity/';
const root = resolve('dist');
const mime: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
async function serve(pathname: string, response: ServerResponse) {
  const file = resolve(root, pathname.slice(mount.length) || 'index.html');
  if (!pathname.startsWith(mount) || !file.startsWith(root + sep)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
}
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  void serve(decodeURIComponent(pathname), response).catch(() => {
    response.writeHead(500).end();
  });
});
let url: string;

test.beforeAll(async () => {
  await new Promise<void>((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No HTTP port');
  url = `http://127.0.0.1:${address.port}${mount}`;
});
test.afterAll(async () => {
  await new Promise<void>((accept, reject) => {
    server.close((error) => (error ? reject(error) : accept()));
  });
});

test('Pages subpath loads production assets and preserves a built cafe on reload', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => errors.push(request.url()));
  await page.goto(url);
  await expect(page.locator('canvas')).toBeVisible();
  expect(await page.evaluate(() => 'CAT_CITY_DEBUG' in window)).toBe(false);
  await clickTile(page, 4, 4);
  await page.locator('[data-build-type=CAT_CAFE]').click();
  await expect(page.getByTestId('coins')).toHaveText('700');
  await page.getByRole('button', { name: '保存进度' }).click();
  const saved = await page.evaluate(() =>
    localStorage.getItem('cat-city.save.v1'),
  );
  expect(saved).not.toBeNull();
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('coins')).toHaveText('700');
  await clickTile(page, 4, 4);
  await expect(page.locator('#move-building')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('pages.png') });
  await testInfo.attach('save.json', {
    body: saved!,
    contentType: 'application/json',
  });
  expect(errors).toEqual([]);
});
