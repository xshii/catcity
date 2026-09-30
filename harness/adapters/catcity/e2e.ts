import type { FullCheck } from '../../runner/full-checks';
import { FEATURES, moduleOf } from './modules';

type Feature = (typeof FEATURES)[number];

interface SpecEntry {
  /** The feature modules whose screens the spec drives or measures. */
  modules: readonly Feature[];
  /** Runs with every choice: the quick look that the whole page still works. */
  smoke?: true;
  /** Measures where things sit across the page: runs for any feature stylesheet change. */
  layout?: true;
}

/**
 * Every spec in tests/e2e/ and the feature modules it covers (user 2026-09-30: E2E chosen
 * by changed module). tests/unit/e2e-choice.test.ts fails for a spec left out.
 */
export const E2E_SPECS: Readonly<Record<string, SpecEntry>> = {
  'breed.spec.ts': { modules: ['cats'] },
  'cat-coats.spec.ts': { modules: ['city', 'cats'] },
  'cat-drag.spec.ts': { modules: ['city'] },
  'cat-looks.spec.ts': { modules: ['cats'] },
  'cat-maker.spec.ts': { modules: ['cats'] },
  'catch-card.spec.ts': { modules: ['fishing'] },
  'cats-panel.spec.ts': { modules: ['cats'] },
  // The first minute of a game: Mochi by the pond, and into fishing without travel.
  'city-input.spec.ts': { modules: ['city', 'fishing'], smoke: true },
  'fishing-landing.spec.ts': { modules: ['fishing'] },
  'fishing-scene.spec.ts': { modules: ['fishing', 'city', 'cats'] },
  // The widest: production isolation, saves, the bridge, a shared outing and its recall.
  'game.spec.ts': {
    modules: ['city', 'fishing', 'cats', 'companion'],
    smoke: true,
  },
  'invite.spec.ts': { modules: ['cats'] },
  'main-page.spec.ts': { modules: ['city'], layout: true },
  'motion-fishing.spec.ts': { modules: ['fishing'] },
  'notice-layer.spec.ts': {
    modules: ['city', 'fishing', 'cats'],
    layout: true,
  },
  // The production build under a Pages subpath: a stylesheet can break an asset path.
  'pages.spec.ts': { modules: ['city'], layout: true },
  'petting.spec.ts': { modules: ['petting', 'cats'] },
  'river-layout.spec.ts': {
    modules: ['fishing', 'city', 'cats', 'companion'],
    layout: true,
  },
  'salon.spec.ts': { modules: ['cats', 'city'] },
  // Storage between tabs: platform code, whose changes run every spec.
  'save-tabs.spec.ts': { modules: [] },
  'settings-gear.spec.ts': {
    modules: ['fishing', 'city', 'petting'],
    layout: true,
  },
  'stray-start.spec.ts': { modules: ['cats', 'city'] },
};

export interface E2EChoice {
  /** Spec file names in tests/e2e/, in registry order, or every spec. */
  files: 'all' | string[];
  /** Why, one line per changed file: written to checks.log. */
  why: string[];
}

const isFeature = (name: string | undefined): name is Feature =>
  FEATURES.some((feature) => feature === name);

/**
 * The E2E specs a push runs (user 2026-09-30). Every spec until a full check has passed
 * today; after that, by each changed file: none for documentation and headless tests, a
 * changed spec with the smoke specs, a feature module's specs with the smoke specs (and
 * the layout specs for its stylesheets), and every spec for anything else.
 */
export function chooseE2E(
  input: {
    changed: readonly string[];
    fullChecks: readonly FullCheck[];
    /** The local day, YYYY-MM-DD. */
    today: string;
  },
  specs: Readonly<Record<string, SpecEntry>> = E2E_SPECS,
): E2EChoice {
  const names = Object.keys(specs);
  const where = (test: (entry: SpecEntry) => boolean | undefined) =>
    names.filter((name) => test(specs[name]!));
  const smoke = where((entry) => entry.smoke);
  if (!input.fullChecks.some((check) => check.ok && check.date === input.today))
    return {
      files: 'all',
      why: [`no full check has passed today (${input.today}): every spec`],
    };
  if (!input.changed.length)
    return { files: [], why: ['nothing changed since the merge base'] };

  const chosen = new Set<string>();
  let all = false;
  const why = input.changed.map((path) => {
    const { specs: need, reason } = needOf(path);
    if (need === 'all') all = true;
    else for (const name of need) chosen.add(name);
    return `${path}: ${reason}`;
  });
  return { files: all ? 'all' : names.filter((name) => chosen.has(name)), why };

  function needOf(path: string): {
    specs: 'all' | readonly string[];
    reason: string;
  } {
    if (/^(docs|specs)\//.test(path) || path.endsWith('.md'))
      return { specs: [], reason: 'documentation, no E2E' };
    if (/^tests\/(unit|view|integration|simulation)\//.test(path))
      return { specs: [], reason: 'a vitest test, no E2E' };
    const spec = /^tests\/e2e\/([^/]+\.spec\.ts)$/.exec(path)?.[1];
    if (spec && names.includes(spec))
      return {
        specs: [spec, ...smoke],
        reason: 'this spec and the smoke specs',
      };
    const module = moduleOf(path);
    if (isFeature(module)) {
      const own = where((entry) => entry.modules.includes(module));
      return path.endsWith('.css')
        ? {
            specs: [...own, ...where((entry) => entry.layout), ...smoke],
            reason: `a ${module} stylesheet: its specs, the layout and the smoke specs`,
          }
        : {
            specs: [...own, ...smoke],
            reason: `the ${module} module: its specs and the smoke specs`,
          };
    }
    return {
      specs: 'all',
      reason: module
        ? `${module}, not a feature module: every spec`
        : 'no rule lists it: every spec',
    };
  }
}
