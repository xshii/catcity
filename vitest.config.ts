import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'headless',
          environment: 'node',
          include: ['tests/{unit,simulation,integration}/**/*.test.ts'],
        },
      },
      {
        // The real page in a simulated DOM, Phaser stubbed (tests/helpers/view-rig.ts); its
        // stylesheets load so that visibility follows the page's own CSS.
        extends: true,
        test: {
          name: 'view',
          environment: 'happy-dom',
          css: true,
          include: ['tests/view/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: [
        'src/{core,application,content,minigames,providers}/**/*.ts',
        'harness/runner/**/*.ts',
      ],
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 80,
        lines: 85,
        branches: 85,
        functions: 85,
        'src/core/**': {
          statements: 90,
          lines: 90,
          branches: 85,
          functions: 95,
        },
        'src/application/**': {
          statements: 85,
          lines: 90,
          branches: 80,
          functions: 75,
        },
      },
    },
  },
});
