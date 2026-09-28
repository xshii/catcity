import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { GameAdapter, HarnessTask } from './contract';
import { sourceIdentity } from './evidence';
import {
  runProcess,
  startProcess,
  stopProcess,
  waitForServer,
} from './process';

export async function runHarness(
  task: HarnessTask,
  adapter: GameAdapter,
): Promise<string> {
  const directory = join(
    'artifacts',
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`,
  );
  await mkdir(directory, { recursive: true });
  const write = (name: string, value: unknown) =>
    writeFile(join(directory, name), JSON.stringify(value, null, 2));
  const identity = await sourceIdentity();
  const buildVersion = `${identity.commit?.slice(0, 8) ?? 'local'}-${identity.sourceDigest.slice(0, 12)}`;
  const environment = { ...process.env, BUILD_VERSION: buildVersion };
  const results: { name: string; ok: boolean; error?: string }[] = [];
  const consoleLog: { type: string; text: string }[] = [];
  const failures: string[] = [];
  const step = async (name: string, action: () => Promise<void>) => {
    try {
      await action();
      results.push({ name, ok: true });
    } catch (error) {
      const message = String(error);
      results.push({ name, ok: false, error: message });
      throw error;
    }
  };
  let server: ChildProcess | undefined;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  await write('task.json', task);
  try {
    for (const command of task.commands) {
      console.log(`[harness] ${command.name}`);
      await step(command.name, () =>
        runProcess(
          command.executable,
          command.args,
          join(directory, 'checks.log'),
          environment,
          command.timeoutMs,
        ),
      );
    }
    console.log('[harness] launch + browser acceptance');
    server = startProcess(
      task.launch.executable,
      task.launch.args,
      join(directory, 'server.log'),
      environment,
    );
    await waitForServer(task.launch.url, server);
    browser = await chromium.launch();
    context = await browser.newContext({
      viewport: { width: 1280, height: 1000 },
    });
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    page = await context.newPage();
    page.on('console', (message) =>
      consoleLog.push({ type: message.type(), text: message.text() }),
    );
    page.on('pageerror', (error) =>
      consoleLog.push({ type: 'pageerror', text: error.message }),
    );
    await page.goto(task.launch.url);
    await adapter.exercise(page, step);
  } catch (error) {
    failures.push(String(error));
  } finally {
    if (page) {
      try {
        const evidence = await adapter.collect(page);
        for (const [name, value] of Object.entries(evidence))
          await write(name, value);
        await step('replay', async () => {
          adapter.verifyReplay(evidence);
        });
      } catch (error) {
        failures.push(`State evidence/replay: ${String(error)}`);
      }
      try {
        await page.screenshot({
          path: join(directory, 'screenshot.png'),
          fullPage: true,
        });
      } catch (error) {
        failures.push(`Screenshot: ${String(error)}`);
      }
    } else failures.push('Browser evidence unavailable: no page was created');
    if (context) {
      try {
        await context.tracing.stop({
          path: join(directory, 'playwright-trace.zip'),
        });
      } catch (error) {
        failures.push(`Browser trace: ${String(error)}`);
      }
    }
    await browser?.close();
    if (server) stopProcess(server);
    const browserErrors = consoleLog.filter(
      (entry) => entry.type === 'error' || entry.type === 'pageerror',
    );
    if (browserErrors.length)
      failures.push(`Browser errors: ${JSON.stringify(browserErrors)}`);
    for (const criterion of task.acceptanceCriteria) {
      if (!results.some((result) => result.name === criterion && result.ok))
        failures.push(`Acceptance incomplete: ${criterion}`);
    }
    await write('console.json', consoleLog);
    await write('task-result.json', {
      ok: failures.length === 0,
      results,
      failures,
    });
    await write('manifest.json', {
      task: task.id,
      buildVersion,
      ...identity,
      completedAt: new Date().toISOString(),
      ok: failures.length === 0,
      failures,
    });
  }
  console.log(`[harness] artifacts: ${directory}`);
  if (failures.length) throw new Error(failures.join('\n'));
  return directory;
}
