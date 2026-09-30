import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** One full check, every browser test included: the local day it ran, the commit, the result. */
export interface FullCheck {
  date: string;
  commit: string | null;
  ok: boolean;
}

/**
 * Where full checks are recorded: artifacts/full-checks.jsonl in the main checkout, which
 * every worktree of the repository shares, so "today's full check" means any of them.
 */
export function fullCheckLog(cwd = process.cwd()): string {
  const common = execFileSync(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
  return join(dirname(common), 'artifacts', 'full-checks.jsonl');
}

const isFullCheck = (value: unknown): value is FullCheck => {
  const check = value as Partial<FullCheck> | null;
  return (
    typeof check?.date === 'string' &&
    (typeof check.commit === 'string' || check.commit === null) &&
    typeof check.ok === 'boolean'
  );
};

/** The recorded full checks, oldest first; a line that is not one is left out. */
export function readFullChecks(log: string): FullCheck[] {
  if (!existsSync(log)) return [];
  return readFileSync(log, 'utf8')
    .split('\n')
    .flatMap((line) => {
      try {
        const value: unknown = JSON.parse(line);
        return isFullCheck(value)
          ? [{ date: value.date, commit: value.commit, ok: value.ok }]
          : [];
      } catch {
        return [];
      }
    });
}

export function recordFullCheck(log: string, check: FullCheck): void {
  mkdirSync(dirname(log), { recursive: true });
  appendFileSync(log, `${JSON.stringify(check)}\n`);
}

/** The local calendar day, YYYY-MM-DD: what "today" means for the daily full check. */
export function localDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
