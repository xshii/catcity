import {
  BUILDINGS,
  buildingPrice,
  CAFE,
  CITY_COSTS,
  CITY_START,
  landPrice,
} from '../../src/content/city';
import type { HarnessTask } from '../runner/contract';
import { localOrigin, testPorts } from '../runner/test-ports';

const ports = testPorts();

/** Coins after each purchase of the run, from the prices in content (spec 040). */
const afterLand = CITY_START.coins - landPrice({ x: 2, y: 5 });
const afterRoad = afterLand - CITY_COSTS.placeRoad - CITY_COSTS.upgradeRoad;
const afterHome = afterRoad - buildingPrice('CAT_APARTMENT', 0);
export const cityLoopCoins = {
  afterLand,
  afterRoad,
  afterHome,
  built: afterHome - buildingPrice('CAT_CAFE', 0),
  /** Mochi is the cafe's only customer. */
  payment: CAFE.coinsPerCustomer,
  /** The silver fish sold at the end. */
  fishSold: 8,
} as const;

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
  commands: ['typecheck', 'lint', 'test:coverage', 'build'].map((script) => ({
    name: script,
    executable: 'npm',
    args: ['run', script],
  })),
  // Playwright's web servers build what the acceptance serves; with no E2E it is built here.
  browserTests: (files) =>
    files === 'all' || files.length
      ? [
          {
            name: 'test:e2e',
            executable: 'npm',
            args: [
              'run',
              'test:e2e',
              ...(files === 'all' ? [] : ['--', ...files]),
            ],
            timeoutMs: 900_000,
          },
        ]
      : [
          {
            name: 'build:test',
            executable: 'npm',
            args: ['run', 'build:test'],
          },
        ],
  expectedState: {
    initialCoins: CITY_START.coins,
    builtCoins: cityLoopCoins.built,
    finalCoins: `${cityLoopCoins.built + cityLoopCoins.fishSold} + ${cityLoopCoins.payment} × city payouts passed (every ${BUILDINGS.CAT_CAFE.intervalMinutes} game minutes, one customer)`,
    finalMinute: `city walking time + ${2 * BUILDINGS.CAT_CAFE.intervalMinutes}`,
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
