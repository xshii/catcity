import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export interface LocalPublicationConfig {
  id: string;
  buildDirectory: string;
  artifactDirectory: string;
  port: number;
  launch: { executable: string; args: string[] };
}
const publicationSchema = z.object({
  id: z.string(),
  releaseId: z.string(),
  pid: z.number().int().positive(),
  site: z.string(),
  evidence: z.string(),
  url: z.string().url(),
  urls: z.array(z.string()),
  buildVersion: z.string(),
  gateEvidence: z.string(),
  launch: z.strictObject({
    executable: z.string().min(1),
    args: z.array(z.string()),
  }),
});
export type LocalPublication = z.infer<typeof publicationSchema>;
const statePath = (config: LocalPublicationConfig) =>
  join(config.artifactDirectory, 'current.json');
async function readState(config: LocalPublicationConfig) {
  try {
    return publicationSchema.parse(
      JSON.parse(await readFile(statePath(config), 'utf8')),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
async function writeState(
  config: LocalPublicationConfig,
  state: LocalPublication,
) {
  const temporary = `${statePath(config)}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2));
  await rename(temporary, statePath(config));
}
function ownsProcess(state: LocalPublication): boolean {
  try {
    const command = execFileSync(
      'ps',
      ['-p', String(state.pid), '-o', 'command='],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return command.includes(state.site);
  } catch {
    return false;
  }
}
async function healthy(state: LocalPublication): Promise<boolean> {
  if (!ownsProcess(state)) return false;
  try {
    const response = await fetch(`${state.url}/release.json`, {
      signal: AbortSignal.timeout(1500),
    });
    const marker = (await response.json()) as { releaseId?: string };
    return response.ok && marker.releaseId === state.releaseId;
  } catch {
    return false;
  }
}
export async function publicationStatus(config: LocalPublicationConfig) {
  const state = await readState(config);
  return { running: state ? await healthy(state) : false, state };
}
async function stopOwned(state: LocalPublication): Promise<boolean> {
  if (!ownsProcess(state)) return false;
  // Match the immutable site before signalling this PID, including failed/rollback launches.
  try {
    process.kill(state.pid, 'SIGTERM');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
  for (let i = 0; i < 50; i++) {
    if (!ownsProcess(state)) return true;
    await delay(100);
  }
  throw new Error(
    'Local preview did not stop; no unrelated process was killed',
  );
}
export async function stopPublication(config: LocalPublicationConfig) {
  const state = await readState(config);
  return state ? stopOwned(state) : false;
}
async function verifiedPrevious(
  config: LocalPublicationConfig,
): Promise<LocalPublication | null> {
  const status = await publicationStatus(config);
  if (!status.running || !status.state) return null;
  try {
    const result = JSON.parse(
      await readFile(join(status.state.evidence, 'result.json'), 'utf8'),
    ) as { ok?: boolean; releaseId?: string };
    return result.ok === true && result.releaseId === status.state.releaseId
      ? status.state
      : null;
  } catch {
    return null;
  }
}
async function launch(release: Omit<LocalPublication, 'pid'>) {
  const output = openSync(join(release.evidence, 'server.log'), 'a');
  let child: ChildProcess;
  try {
    child = spawn(
      release.launch.executable,
      release.launch.args.map((arg) => (arg === '{site}' ? release.site : arg)),
      { detached: true, stdio: ['ignore', output, output] },
    );
  } finally {
    closeSync(output);
  }
  await new Promise<void>((resolveSpawn, reject) => {
    child.once('spawn', resolveSpawn);
    child.once('error', reject);
  });
  child.unref();
  return { state: { ...release, pid: child.pid! }, child };
}
async function waitReady(
  state: LocalPublication,
  child: ChildProcess,
): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error('Preview exited before readiness');
    if (await healthy(state)) return;
    await delay(200);
  }
  throw new Error('Local publication readiness timed out');
}
async function restore(
  config: LocalPublicationConfig,
  previous: LocalPublication | null,
) {
  if (!previous) return { attempted: false };
  let state: LocalPublication | undefined;
  try {
    const launched = await launch(previous);
    state = launched.state;
    await waitReady(state, launched.child);
    await writeState(config, state);
    return { attempted: true, ok: true, releaseId: previous.releaseId };
  } catch (error) {
    let cleanupError: string | undefined;
    try {
      if (state) await stopOwned(state);
    } catch (cleanup) {
      cleanupError = String(cleanup);
    }
    return {
      attempted: true,
      ok: false,
      releaseId: previous.releaseId,
      error: String(error),
      ...(cleanupError ? { cleanupError } : {}),
    };
  }
}
export async function publishLocal(
  config: LocalPublicationConfig,
  gateEvidence: string,
  smoke: (publication: LocalPublication) => Promise<void>,
): Promise<LocalPublication> {
  const gate = z
    .object({ ok: z.literal(true), buildVersion: z.string() })
    .parse(
      JSON.parse(await readFile(join(gateEvidence, 'manifest.json'), 'utf8')),
    );
  const releaseId = randomUUID();
  const evidence = resolve(config.artifactDirectory, releaseId);
  const site = join(evidence, 'site');
  await mkdir(evidence, { recursive: true });
  await cp(config.buildDirectory, site, { recursive: true });
  await writeFile(
    join(site, 'release.json'),
    JSON.stringify({ releaseId, buildVersion: gate.buildVersion }),
  );
  const url = `http://127.0.0.1:${config.port}`;
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((address) => address?.family === 'IPv4' && !address.internal)
    .map((address) => `http://${address!.address}:${config.port}`);
  const release: Omit<LocalPublication, 'pid'> = {
    id: config.id,
    releaseId,
    site,
    evidence,
    url,
    urls: [...new Set([url, ...addresses])],
    buildVersion: gate.buildVersion,
    gateEvidence: resolve(gateEvidence),
    launch: {
      executable: config.launch.executable,
      args: [...config.launch.args],
    },
  };
  const previous = await verifiedPrevious(config);
  await stopPublication(config);
  let state: LocalPublication | undefined;
  try {
    const launched = await launch(release);
    state = launched.state;
    await writeState(config, state);
    await waitReady(state, launched.child);
    await smoke(state);
    await writeFile(
      join(evidence, 'result.json'),
      JSON.stringify({ ok: true, ...state }, null, 2),
    );
    return state;
  } catch (error) {
    let cleanupError: string | undefined;
    try {
      if (state) await stopOwned(state);
    } catch (cleanup) {
      cleanupError = String(cleanup);
    }
    const rollback = await restore(config, previous);
    await writeFile(
      join(evidence, 'result.json'),
      JSON.stringify(
        {
          ok: false,
          ...(state ?? release),
          error: String(error),
          ...(cleanupError ? { cleanupError } : {}),
          rollback,
        },
        null,
        2,
      ),
    );
    throw error;
  }
}
