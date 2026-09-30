import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chooseE2E, E2E_SPECS } from '../../harness/adapters/catcity/e2e';
import { FEATURES, MODULES } from '../../harness/adapters/catcity/modules';

const TODAY = '2026-09-30';
const PASSED_TODAY = [{ date: TODAY, commit: 'c0ffee', ok: true }];
/** A small registry of its own, so each rule reads without the real list. */
const SPECS = {
  'city.spec.ts': { modules: ['city'] },
  'fishing.spec.ts': { modules: ['fishing'] },
  'cats.spec.ts': { modules: ['city', 'cats'] },
  'layout.spec.ts': { modules: [], layout: true },
  'smoke-a.spec.ts': { modules: [], smoke: true },
  'smoke-b.spec.ts': { modules: ['fishing'], smoke: true },
} as const;
const SMOKE = ['smoke-a.spec.ts', 'smoke-b.spec.ts'];

const choose = (changed: string[], fullChecks = PASSED_TODAY) =>
  chooseE2E({ changed, fullChecks, today: TODAY }, SPECS);

describe('choosing E2E specs by what changed (user 2026-09-30)', () => {
  it('runs every spec until a full check has passed today', () => {
    const docs = ['docs/testing.md'];
    expect(choose(docs, []).files).toBe('all');
    expect(
      choose(docs, [{ date: TODAY, commit: 'c0ffee', ok: false }]).files,
    ).toBe('all');
    expect(
      choose(docs, [{ date: '2026-09-29', commit: 'c0ffee', ok: true }]).files,
    ).toBe('all');
    expect(choose(docs, []).why.join('\n')).toContain(TODAY);
    // One pass today is enough, whatever failed after it.
    expect(
      choose(docs, [...PASSED_TODAY, { date: TODAY, commit: 'bad', ok: false }])
        .files,
    ).toEqual([]);
  });

  it('runs no E2E for documentation', () => {
    expect(
      choose([
        'docs/testing.md',
        'specs/041-master-plan/tasks.md',
        'README.md',
        'AGENTS.md',
        'src/view/README.md',
        'harness/README.md',
      ]).files,
    ).toEqual([]);
  });

  it('runs no E2E for headless and view-rig tests: vitest runs them anyway', () => {
    expect(
      choose(['tests/unit/place.test.ts', 'tests/view/settings.test.ts']).files,
    ).toEqual([]);
  });

  it('runs a changed E2E spec with the two smoke specs', () => {
    expect(choose(['tests/e2e/city.spec.ts']).files).toEqual([
      'city.spec.ts',
      ...SMOKE,
    ]);
  });

  it('runs the specs of a changed feature module with the smoke specs', () => {
    expect(choose(['src/view/cats/roster.ts']).files).toEqual([
      'cats.spec.ts',
      ...SMOKE,
    ]);
    // Motion is part of the fishing module.
    expect(choose(['src/view/fishing/motion/rod.ts']).files).toEqual([
      'fishing.spec.ts',
      ...SMOKE,
    ]);
    expect(
      choose(['src/view/city/scene.ts', 'src/view/fishing/panel.ts']).files,
    ).toEqual(['city.spec.ts', 'fishing.spec.ts', 'cats.spec.ts', ...SMOKE]);
  });

  it('adds the layout specs for a feature stylesheet', () => {
    expect(choose(['src/view/city/actions.css']).files).toEqual([
      'city.spec.ts',
      'cats.spec.ts',
      'layout.spec.ts',
      ...SMOKE,
    ]);
  });

  it('runs every spec for shared view code, the assembly and the rules', () => {
    for (const path of [
      'src/view/art/cat.ts',
      'src/view/art/city-map.ts',
      'src/view/common/mood.ts',
      'src/view/common/settings.css',
      'src/view/styles/base.css',
      'src/view/shell/panel.ts',
      'src/view/index.ts',
      'src/core/world.ts',
      'src/content/cats.ts',
      'src/minigames/angling.ts',
      'src/application/session.ts',
      'src/platform/storage.ts',
      'src/providers/rule-dialogue.ts',
      'src/debug/bridge.ts',
      'src/main.ts',
    ])
      expect(choose([path]).files, path).toBe('all');
  });

  it('runs every spec for a path no rule lists', () => {
    for (const path of [
      'package.json',
      'package-lock.json',
      'playwright.config.ts',
      'vite.config.ts',
      'index.html',
      '.githooks/pre-push',
      'harness/run.ts',
      'harness/adapters/catcity/city-input.ts',
      'tests/helpers/world.ts',
      'tests/fixtures/device/swing.json',
      'tests/integration/replay.test.ts',
      'tests/e2e/unregistered.spec.ts',
      'src/view/new-module/thing.ts',
    ])
      expect(choose([path]).files, path).toBe('all');
  });

  it('runs every spec when any one changed file needs it', () => {
    const choice = choose([
      'docs/testing.md',
      'src/view/cats/roster.ts',
      'src/core/world.ts',
    ]);
    expect(choice.files).toBe('all');
    expect(choice.why.join('\n')).toContain('src/core/world.ts');
  });

  it('runs no E2E when nothing changed', () => {
    expect(choose([]).files).toEqual([]);
  });

  it('says why for each changed file', () => {
    const why = choose([
      'docs/testing.md',
      'src/view/cats/roster.ts',
      'src/view/city/actions.css',
    ]).why.join('\n');
    for (const path of [
      'docs/testing.md',
      'src/view/cats/roster.ts',
      'src/view/city/actions.css',
    ])
      expect(why).toContain(path);
  });
});

describe('the E2E registry', () => {
  it('lists every E2E spec on disk, and only those', () => {
    const onDisk = readdirSync('tests/e2e').filter((name) =>
      name.endsWith('.spec.ts'),
    );
    expect(Object.keys(E2E_SPECS).sort()).toEqual(onDisk.sort());
  });

  it('files specs under feature modules of the module table', () => {
    for (const [spec, entry] of Object.entries(E2E_SPECS))
      for (const module of entry.modules) {
        expect(Object.keys(MODULES), spec).toContain(module);
        expect(FEATURES, spec).toContain(module);
      }
  });

  it('names two smoke specs, some layout specs and specs for every feature module', () => {
    const entries = Object.values(E2E_SPECS);
    expect(entries.filter((entry) => entry.smoke)).toHaveLength(2);
    expect(entries.some((entry) => entry.layout)).toBe(true);
    for (const feature of FEATURES)
      expect(
        entries.some((entry) => entry.modules.includes(feature)),
        feature,
      ).toBe(true);
  });

  it('keeps a change to the cats panel off the motion specs', () => {
    const files = chooseE2E({
      changed: ['src/view/cats/roster.ts'],
      fullChecks: PASSED_TODAY,
      today: TODAY,
    }).files;
    expect(files).toContain('cats-panel.spec.ts');
    expect(files).not.toContain('motion-fishing.spec.ts');
  });
});
