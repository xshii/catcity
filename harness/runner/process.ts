import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

export function startProcess(
  executable: string,
  args: string[],
  logPath: string,
  env: NodeJS.ProcessEnv,
): ChildProcess {
  const child = spawn(executable, args, {
    env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (data: Buffer) => appendFileSync(logPath, data));
  child.stderr?.on('data', (data: Buffer) => appendFileSync(logPath, data));
  child.on('error', (error) => appendFileSync(logPath, `${error.message}\n`));
  return child;
}

export function stopProcess(child: ChildProcess) {
  if (!child.pid) return;
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
    else child.kill('SIGTERM');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

export async function runProcess(
  executable: string,
  args: string[],
  logPath: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const child = startProcess(executable, args, logPath, env);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      stopProcess(child);
      reject(new Error(`Command timed out: ${executable}`));
    }, 300_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${executable} ${args.join(' ')} failed: ${code ?? signal}`,
          ),
        );
    });
  });
}

export async function waitForServer(
  url: string,
  child: ChildProcess,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error('Preview process exited before readiness');
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(500) })).ok) return;
    } catch {
      /* Retry within bounded readiness window. */
    }
    await delay(200);
  }
  throw new Error(`Server did not become ready: ${url}`);
}
