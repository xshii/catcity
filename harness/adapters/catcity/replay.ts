import { readFile } from 'node:fs/promises';
import type { ReplayRecord } from '../../../src/application/session';
import { replayWorld } from './replay-world';

const path = process.argv[2];
if (!path)
  throw new Error('Usage: npm run replay -- artifacts/<run-id>/commands.json');
const world = replayWorld(
  JSON.parse(await readFile(path, 'utf8')) as ReplayRecord,
);
console.log(
  JSON.stringify({
    ok: true,
    seed: world.seed,
    minute: world.minute,
    coins: world.coins,
  }),
);
