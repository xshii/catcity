import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function sourceIdentity() {
  const hash = createHash('sha256');
  const excluded = new Set([
    '.git',
    'node_modules',
    '.npm-cache',
    'artifacts',
    'dist',
    'dist-test',
    'test-results',
    'playwright-report',
    'coverage',
  ]);
  async function visit(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (excluded.has(entry.name) || entry.name.startsWith('.env')) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        hash.update(path);
        hash.update(await readFile(path));
      }
    }
  }
  await visit('.');
  let commit: string | null = null;
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    /* New repository has no commit yet. */
  }
  return {
    commit,
    sourceDigest: hash.digest('hex'),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  };
}
