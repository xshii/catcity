import type { HarnessTask } from '../runner/contract';
import { localOrigin, testPorts } from '../runner/test-ports';

const ports = testPorts();

export const cityLoopTask: HarnessTask = {
  id: 'm5-city-walk-fish',
  goal: 'Buy land, connect and upgrade roads, build a home and cafe, move a building, walk a cat to the shore, fish and recall its memory, recover while idle, reload and replay the exact world.',
  acceptanceCriteria: [
    'initial-world',
    'land-and-road',
    'apartment-and-home',
    'build-cafe',
    'move-building',
    'income',
    'select-cat',
    'cat-walking',
    'dialogue',
    'shared-outing',
    'atlas-and-breed',
    'cat-recovery-clock',
    'save-reload',
    'replay',
  ],
  commands: [
    {
      name: 'check',
      executable: 'npm',
      args: ['run', 'check'],
      timeoutMs: 900_000,
    },
  ],
  expectedState: {
    initialCoins: 1000,
    builtCoins: 380,
    finalCoins:
      '388 + 1 × full payment intervals played (one customer, spec 040)',
    finalMinute: 'city walking time + two payment intervals',
    landBought: 1,
    upgradedRoads: 1,
    buildings: ['CAT_APARTMENT', 'CAT_CAFE'],
    homeAssigned: true,
    catEnergy: 100,
    buildingType: 'CAT_CAFE',
    catId: 'mochi',
    memoryCount: 2,
    fishingMemory: 'SILVER',
    atlasSpecies: 1,
    fishSold: 1,
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
      String(ports.acceptance),
      '--strictPort',
    ],
    url: localOrigin(ports.acceptance),
  },
};
