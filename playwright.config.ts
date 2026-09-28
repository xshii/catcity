import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  outputDir: 'artifacts/e2e/results',
  reporter: [['list'], ['json', { outputFile: 'artifacts/e2e/results.json' }]],
  use: {
    browserName: 'chromium',
    viewport: { width: 1280, height: 1000 },
    baseURL: 'http://127.0.0.1:4173',
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
      command: 'npm run build:test && npm run preview:test',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command:
        'npm run build && npx vite preview --host 127.0.0.1 --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
