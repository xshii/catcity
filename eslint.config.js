import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-test/**',
      'artifacts/**',
      'test-results/**',
      'playwright-report/**',
      'coverage/**',
      '.npm-cache/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    files: ['harness/runner/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/adapters',
                '**/adapters/**',
                '**/tasks',
                '**/tasks/**',
                '**/src',
                '**/src/**',
              ],
              message:
                'Keep game-specific composition in harness/run.ts; the runner uses injected contracts.',
            },
          ],
        },
      ],
    },
  },
  {
    // A view module finds elements only inside what it created or was handed; the page
    // mount passes other modules' elements as parameters (spec 015).
    files: ['src/view/**/*.ts'],
    ignores: [
      // The page mount writes the page markup and hands its elements out.
      'src/view/shell/panel.ts',
      // Measures the floating bars of several modules by the selectors the harness shares.
      'src/view/city/bars.ts',
      // Not yet migrated (spec 015 step 4 follow-up).
      'src/view/shell/layout.ts',
      'src/view/shell/navigation.ts',
      'src/view/companion/journal.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='document'][callee.property.name=/^(getElementById|querySelector|querySelectorAll|getElementsBy.*)$/]",
          message:
            "Don't look up the document: query inside an element this module created, or take the element as a parameter from the mount.",
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.ts', 'src/providers/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'phaser',
            '**/view',
            '**/view/**',
            '**/platform',
            '**/platform/**',
            '**/debug',
            '**/debug/**',
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage'],
    },
  },
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'phaser',
            '**/view',
            '**/view/**',
            '**/platform',
            '**/platform/**',
            '**/debug',
            '**/debug/**',
            '**/providers',
            '**/providers/**',
          ],
        },
      ],
    },
  },
  {
    files: ['src/core/**/*.ts', 'src/content/**/*.ts', 'src/minigames/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'phaser',
            'node:*',
            '**/view',
            '**/view/**',
            '**/platform',
            '**/platform/**',
            '**/application',
            '**/application/**',
            '**/providers',
            '**/providers/**',
            '**/debug',
            '**/debug/**',
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'fetch',
        'Date',
        'performance',
        'setTimeout',
        'setInterval',
        'crypto',
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use RandomService with persisted state.',
        },
      ],
    },
  },
);
