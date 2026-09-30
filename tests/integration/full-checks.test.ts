import { execFileSync } from 'node:child_process';
import { appendFileSync, realpathSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { changedSince } from '../../harness/runner/changes';
import {
  fullCheckLog,
  localDate,
  readFullChecks,
  recordFullCheck,
} from '../../harness/runner/full-checks';

// A push runs this suite from the pre-push hook, where git may export GIT_DIR and the
// like for the real repository; the throwaway repositories below must not see them.
for (const key of Object.keys(process.env))
  if (key.startsWith('GIT_')) delete process.env[key];

/** Git without the user's identity or signing settings. */
const git = (repo: string, ...args: string[]) =>
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim();

/** A throwaway repository with one commit on main, also named `base`. */
async function withRepository(test: (repo: string) => void) {
  const repo = realpathSync(await mkdtemp(join(tmpdir(), 'catcity-git-')));
  try {
    git(repo, 'init', '-q', '-b', 'main');
    for (const name of ['a.txt', 'b.txt', 'old.txt'])
      writeFileSync(join(repo, name), `${name}\n`);
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'base');
    git(repo, 'branch', 'base');
    test(repo);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
}

it('lists files changed since the merge base: committed, staged, unstaged, untracked and both sides of a move', async () => {
  await withRepository((repo) => {
    const base = git(repo, 'rev-parse', 'base');
    writeFileSync(join(repo, 'a.txt'), 'changed\n');
    git(repo, 'mv', 'old.txt', 'new.txt');
    git(repo, 'commit', '-qam', 'work');
    writeFileSync(join(repo, 'b.txt'), 'unstaged\n');
    writeFileSync(join(repo, 'd.txt'), 'staged\n');
    git(repo, 'add', 'd.txt');
    writeFileSync(join(repo, 'c.txt'), 'untracked\n');
    expect(changedSince('base', repo)).toEqual({
      base,
      files: ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'new.txt', 'old.txt'],
    });
  });
});

it('fails for a ref the repository does not have', async () => {
  await withRepository((repo) => {
    expect(() => changedSince('origin/main', repo)).toThrow();
  });
});

it('keeps the full-check log in the main checkout, shared by its worktrees', async () => {
  await withRepository((repo) => {
    const log = join(repo, 'artifacts', 'full-checks.jsonl');
    expect(fullCheckLog(repo)).toBe(log);
    const worktree = `${repo}-wt`;
    git(repo, 'worktree', 'add', '-q', worktree, 'base');
    try {
      expect(fullCheckLog(worktree)).toBe(log);
    } finally {
      git(repo, 'worktree', 'remove', '--force', worktree);
    }
  });
});

it('records full checks one per line and reads back only well-formed ones', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'catcity-full-checks-'));
  const log = join(directory, 'artifacts', 'full-checks.jsonl');
  try {
    expect(readFullChecks(log)).toEqual([]);
    const passed = { date: '2026-09-30', commit: 'c0ffee', ok: true };
    const failed = { date: '2026-09-30', commit: null, ok: false };
    recordFullCheck(log, passed);
    appendFileSync(log, 'not json\n{"date":"2026-09-30","ok":"yes"}\n');
    recordFullCheck(log, failed);
    expect(readFullChecks(log)).toEqual([passed, failed]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('dates a check by the local calendar day', () => {
  expect(localDate(new Date(2026, 8, 30, 0, 5))).toBe('2026-09-30');
  expect(localDate(new Date(2026, 0, 2, 23, 59))).toBe('2026-01-02');
});
