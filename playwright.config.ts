import { defineConfig } from '@playwright/test';
import { localOrigin, testPorts } from './harness/runner/test-ports';

// This checkout's own ports, so worktrees can run their suites at the same time.
const ports = testPorts();

export default defineConfig({
  testDir: './tests/e2e',
  // Tests are independent (own browser context and storage), so they run in parallel;
  // two workers leave CPU for other worktrees' suites on the same machine.
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 60_000,
  outputDir: 'artifacts/e2e/results',
  reporter: [['list'], ['json', { outputFile: 'artifacts/e2e/results.json' }]],
  use: {
    browserName: 'chromium',
    viewport: { width: 1280, height: 1000 },
    baseURL: localOrigin(ports.test),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium' },
    {
      name: 'webkit-motion',
      use: { browserName: 'webkit' },
      grep: /@motion-smoke/,
    },
  ],
  webServer: [
    {
      command: `npm run build:test && npx vite preview --mode test --host 127.0.0.1 --port ${ports.test} --strictPort`,
      url: localOrigin(ports.test),
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm run build && npx vite preview --host 127.0.0.1 --port ${ports.production} --strictPort`,
      url: localOrigin(ports.production),
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
