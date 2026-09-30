import { execFileSync } from 'node:child_process';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/**
 * The files that differ from the merge base of HEAD and `ref`: committed, staged,
 * unstaged or untracked, as the checks will see them. A moved file counts at both paths.
 */
export function changedSince(ref: string, cwd = process.cwd()) {
  const base = git(cwd, 'merge-base', 'HEAD', ref);
  const lines = [
    git(cwd, 'diff', '--name-only', '--no-renames', base),
    git(cwd, 'ls-files', '--others', '--exclude-standard'),
  ].flatMap((output) => output.split('\n').filter(Boolean));
  return { base, files: [...new Set(lines)].sort() };
}

/** The commit checked out, or null outside a repository with commits. */
export function headCommit(cwd = process.cwd()): string | null {
  try {
    return git(cwd, 'rev-parse', 'HEAD');
  } catch {
    return null;
  }
}
