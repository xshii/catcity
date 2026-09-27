import type { HarnessTask } from '../runner/contract';

export const buildCafeTask: HarnessTask = {
  id: 'm0-build-cafe',
  goal: 'Build a cafe, meet Mochi, generate income, and persist the exact world across reload.',
  acceptanceCriteria: [
    'initial-world',
    'build-cafe',
    'income',
    'select-cat',
    'dialogue',
    'save-reload',
    'replay',
  ],
  commands: [{ name: 'check', executable: 'npm', args: ['run', 'check'] }],
  expectedState: {
    initialCoins: 1000,
    builtCoins: 700,
    finalCoins: 710,
    buildingType: 'CAT_CAFE',
    catId: 'mochi',
    memoryCount: 1,
  },
  visualEvidence: ['screenshot.png'],
  regressionTests: [
    'unit',
    'simulation',
    'integration',
    'production-isolation',
    'browser-persistence',
  ],
  launch: {
    executable: 'node',
    args: [
      'node_modules/vite/bin/vite.js',
      'preview',
      '--mode',
      'test',
      '--host',
      '127.0.0.1',
      '--port',
      '4175',
      '--strictPort',
    ],
    url: 'http://127.0.0.1:4175',
  },
};
