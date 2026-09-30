import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { posix } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import {
  importAllowed,
  moduleOf,
  MODULES,
} from '../../harness/adapters/catcity/modules';

/** Every file under src/, from the repository root. */
const SOURCES = readdirSync('src', { recursive: true, encoding: 'utf8' })
  .map((path) => posix.join('src', path))
  .filter((path) => statSync(path).isFile());

/** The file a relative import names: as written, with .ts, or its directory's index.ts. */
function resolveImport(from: string, specifier: string) {
  const base = posix.join(posix.dirname(from), specifier);
  return [base, `${base}.ts`, `${base}/index.ts`].find(
    (path) => existsSync(path) && statSync(path).isFile(),
  );
}

it('keeps view feature modules apart, over the shared view code and under the shell', () => {
  expect(moduleOf('src/view/fishing/motion/rod.ts')).toBe('fishing');
  expect(moduleOf('src/view/index.ts')).toBe('shell');
  expect(moduleOf('src/view/README.md')).toBeUndefined();
  for (const feature of [
    'city',
    'fishing',
    'cats',
    'petting',
    'companion',
  ] as const) {
    for (const shared of ['common', 'art', 'styles', 'core'] as const)
      expect(importAllowed(feature, shared)).toBe(true);
    expect(importAllowed(feature, 'shell')).toBe(false);
    expect(importAllowed('shell', feature)).toBe(true);
  }
  expect(importAllowed('city', 'fishing')).toBe(false);
  expect(importAllowed('art', 'city')).toBe(false);
  expect(importAllowed('art', 'common')).toBe(false);
});

it('puts every source file but a README in exactly one module', () => {
  expect(
    SOURCES.filter((path) => !path.endsWith('.md') && !moduleOf(path)),
  ).toEqual([]);
  const owned = Object.values(MODULES).flatMap((rule) => rule.paths);
  const overlapping = owned.filter((path, index) =>
    owned.some(
      (other, at) =>
        at !== index &&
        (path === other || (other.endsWith('/') && path.startsWith(other))),
    ),
  );
  expect(overlapping).toEqual([]);
});

it('imports across modules only where the module table allows', () => {
  const refused: string[] = [];
  const crossings = new Set<string>();
  for (const from of SOURCES.filter((path) => path.endsWith('.ts'))) {
    const source = readFileSync(from, 'utf8');
    // Static, type-only, re-exported, side-effect (CSS) and dynamic imports alike.
    for (const { fileName } of ts.preProcessFile(source, true, true)
      .importedFiles) {
      if (!fileName.startsWith('.')) continue; // a package
      const to = resolveImport(from, fileName);
      const [a, b] = [moduleOf(from), to && moduleOf(to)];
      if (!a || !b || !importAllowed(a, b))
        refused.push(`${from} → ${fileName} (${a} → ${b ?? to ?? 'missing'})`);
      else if (a !== b) crossings.add(`${a} → ${b}`);
    }
  }
  expect(refused).toEqual([]);
  // The scan sees the imports it checks: the shell mounts the fishing screen.
  expect(crossings).toContain('shell → fishing');
});
