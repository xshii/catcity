import { afterEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PreviewServer } from 'vite';
import {
  createDeviceLogHandler,
  deviceLogPlugin,
} from '../../harness/runner/device-log';

const SESSION = '0f3c2a9e-1b7d-4c55-9a61-2d8e4f7b6c10';
let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

async function receiver(maxTotalBytes?: number) {
  const directory = await mkdtemp(join(tmpdir(), 'device-log-'));
  const handle = createDeviceLogHandler(directory, {
    now: () => new Date('2026-09-29T12:00:00Z'),
    ...(maxTotalBytes ? { maxTotalBytes } : {}),
  });
  const server: Server = createServer((request, response) => {
    void handle(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  cleanup = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  };
  const post = (body: string, method = 'POST') =>
    fetch(`http://127.0.0.1:${address.port}/`, { method, body }).then(
      (response) => response.status,
    );
  const lines = async () =>
    (await readFile(join(directory, `${SESSION}.jsonl`), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { directory, post, lines };
}

it('appends each batch of a session as JSON lines, with what the page dropped', async () => {
  const { post, lines } = await receiver();
  expect(
    await post(
      JSON.stringify({
        session: SESSION,
        entries: [{ kind: 'device', ua: 'phone' }],
      }),
    ),
  ).toBe(204);
  expect(
    await post(
      JSON.stringify({
        session: SESSION,
        dropped: 3,
        entries: [{ kind: 'motion', t: 12.5, b: -310 }],
      }),
    ),
  ).toBe(204);
  expect(await lines()).toEqual([
    { received: '2026-09-29T12:00:00.000Z', kind: 'device', ua: 'phone' },
    { received: '2026-09-29T12:00:00.000Z', kind: 'dropped', count: 3 },
    { received: '2026-09-29T12:00:00.000Z', kind: 'motion', t: 12.5, b: -310 },
  ]);
});

it('refuses anything but a well-formed batch, and writes nothing for it', async () => {
  const { post, directory } = await receiver();
  const entries = [{ kind: 'device' }];
  expect(await post('', 'PUT')).toBe(405);
  expect(await post('not json')).toBe(400);
  // A session id can never name a path outside the log folder.
  expect(await post(JSON.stringify({ session: '../../etc/x', entries }))).toBe(
    400,
  );
  expect(
    await post(JSON.stringify({ session: SESSION, entries: [{ t: 1 }] })),
  ).toBe(400);
  expect(
    await post(
      JSON.stringify({ session: SESSION, entries, pad: 'x'.repeat(600_000) }),
    ),
  ).toBe(413);
  expect(await readdir(directory)).toEqual([]);
});

it('is mounted by the preview server at the route the page posts to', () => {
  const routes: string[] = [];
  const plugin = deviceLogPlugin(tmpdir());
  const hook = plugin.configurePreviewServer as (server: PreviewServer) => void;
  hook({
    middlewares: { use: (route: string) => routes.push(route) },
  } as unknown as PreviewServer);
  expect(routes).toEqual(['/__device-log']);
});

it('stops the whole log folder at its limit, whatever the session', async () => {
  // Each line is 63 bytes: two fit in 150, a third does not.
  const { post, directory } = await receiver(150);
  const batch = (session: string) =>
    JSON.stringify({ session, entries: [{ kind: 'motion', b: 1 }] });
  expect(await post(batch(SESSION))).toBe(204);
  // A new session name does not get a new allowance.
  expect(await post(batch('aaaaaaaa-0000-0000-0000-000000000000'))).toBe(204);
  expect(await post(batch('bbbbbbbb-0000-0000-0000-000000000000'))).toBe(507);
  expect((await readdir(directory)).sort()).toEqual(
    [`${SESSION}.jsonl`, 'aaaaaaaa-0000-0000-0000-000000000000.jsonl'].sort(),
  );
});
