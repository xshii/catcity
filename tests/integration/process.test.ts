import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from '../../harness/runner/process';

function stopOwnedProcess(pid: number): void {
  try {
    process.kill(process.platform === 'win32' ? pid : -pid, 'SIGTERM');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

it('accepts exit zero with the default timeout and records stdout and stderr', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'catcity-process-'));
  const log = join(directory, 'command.log');
  try {
    await expect(
      runProcess(
        process.execPath,
        ['-e', 'console.log("complete"); console.error("diagnostic");'],
        log,
        process.env,
      ),
    ).resolves.toBeUndefined();
    expect(await readFile(log, 'utf8')).toContain('complete');
    expect(await readFile(log, 'utf8')).toContain('diagnostic');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('rejects nonzero exits and launch failures without turning them into success', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'catcity-process-'));
  const log = join(directory, 'command.log');
  try {
    await expect(
      runProcess(
        process.execPath,
        ['-e', 'console.error("deliberate failure"); process.exitCode = 7;'],
        log,
        process.env,
      ),
    ).rejects.toThrow('failed: 7');
    expect(await readFile(log, 'utf8')).toContain('deliberate failure');
    await expect(
      runProcess(join(directory, 'missing-executable'), [], log, process.env),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('honors a command timeout, reports failure and stops its child process', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'catcity-process-'));
  const log = join(directory, 'command.log');
  const pidFile = join(directory, 'pid');
  const script =
    'require("node:fs").writeFileSync(process.argv[1], String(process.pid)); setTimeout(() => process.exit(0), 1500);';
  let pid: number | undefined;
  try {
    await expect(
      runProcess(
        process.execPath,
        ['-e', script, pidFile],
        log,
        process.env,
        500,
      ),
    ).rejects.toThrow('Command timed out');
    pid = Number(await readFile(pidFile, 'utf8'));
    expect(pid).toBeGreaterThan(0);
    await expect
      .poll(() => {
        try {
          process.kill(pid!, 0);
          return false;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
          return true;
        }
      })
      .toBe(true);
  } finally {
    pid ??= await readFile(pidFile, 'utf8')
      .then(Number)
      .catch(() => undefined);
    if (pid) stopOwnedProcess(pid);
    await rm(directory, { recursive: true, force: true });
  }
});
