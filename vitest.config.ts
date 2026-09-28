import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/{unit,simulation,integration}/**/*.test.ts'],
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
