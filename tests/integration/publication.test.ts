import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import {
  publishLocal,
  publishTest,
  publicationStatus,
  stopPublication,
  type LocalPublication,
  type LocalPublicationConfig,
} from '../../harness/runner/local-publication';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'harness-publication-'));
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test port');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  const source = join(root, 'build');
  const gate = join(root, 'gate');
  const script = join(root, 'preview.mjs');
  await mkdir(source);
  await mkdir(gate);
  await writeFile(join(source, 'index.html'), 'checked version');
  await writeFile(
    join(gate, 'manifest.json'),
    JSON.stringify({ ok: true, buildVersion: 'test-build' }),
  );
  await writeFile(
    script,
    `import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const root = process.argv[2];
if ((await readFile(root + '/index.html', 'utf8')) === 'startup failure') process.exit(7);
createServer(async (request, response) => {
 const path = request.url === '/release.json' ? '/release.json' : '/index.html';
 try { response.end(await readFile(root + path)); } catch { response.writeHead(404).end(); }
}).listen(Number(process.argv[3]), '127.0.0.1');`,
  );
  const config: LocalPublicationConfig = {
    id: 'fixture',
    buildDirectory: source,
    artifactDirectory: join(root, 'releases'),
    port,
    launch: {
      executable: process.execPath,
      args: [script, '{site}', String(port)],
    },
  };
  return {
    root,
    source,
    gate,
    config,
    async close() {
      await stopPublication(config);
      await rm(root, { recursive: true, force: true });
    },
    async result(releaseId?: string) {
      const ids = (await readdir(config.artifactDirectory)).filter(
        (name) => name !== 'current.json' && name !== releaseId,
      );
      if (ids.length !== 1) throw new Error('Expected one failed release');
      return JSON.parse(
        await readFile(
          join(config.artifactDirectory, ids[0]!, 'result.json'),
          'utf8',
        ),
      );
    },
  };
}

it('publishes an immutable checked build, reports health, stops only its server and fails closed without reviving a stopped release', async () => {
  const f = await fixture();
  try {
    const publication = await publishLocal(f.config, f.gate, async (state) => {
      expect(await (await fetch(state.url)).text()).toBe('checked version');
    });
    expect((await publicationStatus(f.config)).running).toBe(true);
    await writeFile(join(f.source, 'index.html'), 'unverified edit');
    expect(await (await fetch(publication.url)).text()).toBe('checked version');
    expect(await stopPublication(f.config)).toBe(true);
    expect((await publicationStatus(f.config)).running).toBe(false);
    expect(await stopPublication(f.config)).toBe(false);
    await expect(
      publishLocal(f.config, f.gate, async () => {
        throw new Error('smoke failed');
      }),
    ).rejects.toThrow('smoke failed');
    expect((await publicationStatus(f.config)).running).toBe(false);
    expect(await f.result(publication.releaseId)).toMatchObject({
      ok: false,
      error: 'Error: smoke failed',
      rollback: { attempted: false },
    });
    await writeFile(
      join(f.gate, 'manifest.json'),
      JSON.stringify({ ok: false, buildVersion: 'bad' }),
    );
    await expect(
      publishLocal(f.config, f.gate, async () => {}),
    ).rejects.toThrow();
    expect((await publicationStatus(f.config)).running).toBe(false);
  } finally {
    await f.close();
  }
}, 15000);

it.each(['smoke', 'launch', 'readiness'] as const)(
  'restores the previous verified immutable release after a new %s failure, while reporting failure',
  async (failure) => {
    const f = await fixture();
    try {
      const previous = await publishLocal(f.config, f.gate, async () => {});
      await writeFile(
        join(f.source, 'index.html'),
        failure === 'readiness' ? 'startup failure' : 'new candidate',
      );
      const candidate =
        failure === 'launch'
          ? {
              ...f.config,
              launch: {
                executable: join(f.root, 'missing-executable'),
                args: ['{site}'],
              },
            }
          : f.config;
      await expect(
        publishLocal(candidate, f.gate, async (state) => {
          expect(await (await fetch(state.url)).text()).toBe('new candidate');
          throw new Error('smoke failed');
        }),
      ).rejects.toThrow(
        failure === 'launch'
          ? 'ENOENT'
          : failure === 'readiness'
            ? 'before readiness'
            : 'smoke failed',
      );
      const status = await publicationStatus(f.config);
      expect(status.running).toBe(true);
      expect(status.state).toMatchObject({
        releaseId: previous.releaseId,
        site: previous.site,
        evidence: previous.evidence,
        buildVersion: previous.buildVersion,
      });
      expect(status.state!.pid).not.toBe(previous.pid);
      expect(await (await fetch(previous.url)).text()).toBe('checked version');
      expect(
        await (await fetch(`${previous.url}/release.json`)).json(),
      ).toMatchObject({ releaseId: previous.releaseId });
      const result = await f.result(previous.releaseId);
      expect(result).toMatchObject({
        ok: false,
        rollback: { attempted: true, ok: true, releaseId: previous.releaseId },
      });
      expect(result.error).toContain(
        failure === 'launch'
          ? 'ENOENT'
          : failure === 'readiness'
            ? 'before readiness'
            : 'smoke failed',
      );
      expect(result.releaseId).not.toBe(previous.releaseId);
      expect(
        JSON.parse(
          await readFile(join(previous.evidence, 'result.json'), 'utf8'),
        ),
      ).toMatchObject({ ok: true, releaseId: previous.releaseId });
    } finally {
      await f.close();
    }
  },
  15000,
);

it('test publishes skip the smoke, report unverified and are never restored', async () => {
  const f = await fixture();
  try {
    const trial = await publishTest(f.config, 'try-out');
    expect(await publicationStatus(f.config)).toMatchObject({
      running: true,
      verified: false,
      state: { releaseId: trial.releaseId, buildVersion: 'try-out' },
    });
    await expect(
      publishLocal(f.config, f.gate, async () => {
        throw new Error('smoke failed');
      }),
    ).rejects.toThrow('smoke failed');
    // The unverified trial was stopped for the candidate and is not revived.
    expect((await publicationStatus(f.config)).running).toBe(false);
    expect(await f.result(trial.releaseId)).toMatchObject({
      ok: false,
      rollback: { attempted: false },
    });
  } finally {
    await f.close();
  }
}, 15000);

it('does not revive an unsuccessful release when no verified server is live', async () => {
  const f = await fixture();
  try {
    await expect(
      publishLocal(f.config, f.gate, async () => {
        throw new Error('first smoke failed');
      }),
    ).rejects.toThrow('first smoke failed');
    expect((await publicationStatus(f.config)).running).toBe(false);
    expect(await f.result()).toMatchObject({
      ok: false,
      rollback: { attempted: false },
    });
    const first = (await publicationStatus(f.config)).state!;
    await expect(
      publishLocal(f.config, f.gate, async () => {
        throw new Error('second smoke failed');
      }),
    ).rejects.toThrow('second smoke failed');
    expect((await publicationStatus(f.config)).running).toBe(false);
    expect(await f.result(first.releaseId)).toMatchObject({
      ok: false,
      error: 'Error: second smoke failed',
      rollback: { attempted: false },
    });
  } finally {
    await f.close();
  }
}, 15000);

it('refuses to stop a PID whose command does not own the immutable site', async () => {
  const f = await fixture();
  const foreign = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
    stdio: 'ignore',
  });
  await new Promise<void>((resolve, reject) => {
    foreign.once('spawn', resolve);
    foreign.once('error', reject);
  });
  let own: LocalPublication | undefined;
  try {
    own = await publishLocal(f.config, f.gate, async () => {});
    await writeFile(
      join(f.config.artifactDirectory, 'current.json'),
      JSON.stringify({ ...own, pid: foreign.pid }),
    );
    expect(await stopPublication(f.config)).toBe(false);
    expect(() => process.kill(foreign.pid!, 0)).not.toThrow();
    expect(await (await fetch(own.url)).text()).toBe('checked version');
  } finally {
    foreign.kill('SIGTERM');
    if (own)
      await writeFile(
        join(f.config.artifactDirectory, 'current.json'),
        JSON.stringify(own),
      );
    await f.close();
  }
}, 15000);

it('does not roll back to a live marker that has never passed its publication smoke', async () => {
  const f = await fixture();
  try {
    const previous = await publishLocal(f.config, f.gate, async () => {});
    await rm(join(previous.evidence, 'result.json'));
    expect((await publicationStatus(f.config)).running).toBe(true);
    await expect(
      publishLocal(f.config, f.gate, async () => {
        throw new Error('candidate failed');
      }),
    ).rejects.toThrow('candidate failed');
    expect((await publicationStatus(f.config)).running).toBe(false);
    expect(await f.result(previous.releaseId)).toMatchObject({
      ok: false,
      rollback: { attempted: false },
    });
  } finally {
    await f.close();
  }
}, 15000);

it('records rollback failure separately and rethrows the original candidate failure', async () => {
  const f = await fixture();
  try {
    const previous = await publishLocal(f.config, f.gate, async () => {});
    const original = new Error('original smoke failure');
    await expect(
      publishLocal(f.config, f.gate, async () => {
        await rm(join(previous.site, 'index.html'));
        throw original;
      }),
    ).rejects.toBe(original);
    expect((await publicationStatus(f.config)).running).toBe(false);
    expect(await f.result(previous.releaseId)).toMatchObject({
      ok: false,
      error: 'Error: original smoke failure',
      rollback: {
        attempted: true,
        ok: false,
        releaseId: previous.releaseId,
        error: 'Error: Preview exited before readiness',
      },
    });
  } finally {
    await f.close();
  }
}, 15000);
