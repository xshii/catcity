import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { extractDeviceTrace, type TraceWant } from './device-trace';

const [path, name, want, from, to] = process.argv.slice(2);
if (
  !path ||
  !name ||
  !/^[a-z0-9-]+$/.test(name) ||
  !['cast', 'lift', 'calibrate'].includes(want ?? '') ||
  !Number.isFinite(Number(from)) ||
  !Number.isFinite(Number(to))
)
  throw new Error(
    'Usage: npm run device-trace -- artifacts/device-logs/<session>.jsonl <fixture-name> <cast|lift|calibrate> <from-ms> <to-ms>',
  );
const trace = extractDeviceTrace(await readFile(path, 'utf8'), {
  session: basename(path, '.jsonl'),
  want: want as TraceWant,
  from: Number(from),
  to: Number(to),
});
const directory = 'tests/fixtures/device';
await mkdir(directory, { recursive: true });
const target = join(directory, `${name}.json`);
await writeFile(target, JSON.stringify(trace, null, 2) + '\n');
console.log(
  JSON.stringify({
    fixture: target,
    readings: trace.readings.length,
    expect: trace.expect,
  }),
);
