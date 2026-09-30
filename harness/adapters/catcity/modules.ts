/**
 * Cat City's source modules (2026-09-30): the paths each owns and the other modules it may
 * import. Every file under src/ but a README belongs to exactly one module, and
 * tests/unit/modules.test.ts holds every import in src/ to this table. Paths are from the
 * repository root; one ending in '/' is a directory, any other a single file.
 */
interface ModuleRule<Name> {
  paths: readonly string[];
  /** Other modules it may import; a module always imports its own files. */
  imports: readonly Name[];
}

/** Fails to compile if a rule names a module the table does not have. */
const table = <const T extends { [K in keyof T]: ModuleRule<keyof T> }>(
  modules: T,
): { [K in keyof T]: ModuleRule<keyof T> } => modules;

/**
 * What every view feature module may import: the rules and the application entry below,
 * and the shared view code. Never another feature module or the shell.
 */
const VIEW_FEATURE = [
  'core',
  'content',
  'minigames',
  'application',
  'common',
  'art',
  'styles',
] as const;

export const MODULES = table({
  // Rules: pure TypeScript (eslint keeps the DOM, Phaser and the real clock out).
  core: { paths: ['src/core/'], imports: ['content', 'minigames'] },
  content: { paths: ['src/content/'], imports: [] },
  minigames: { paths: ['src/minigames/'], imports: ['core', 'content'] },
  // The session and its ports, and the implementations main injects.
  application: { paths: ['src/application/'], imports: ['core', 'content'] },
  providers: { paths: ['src/providers/'], imports: ['application', 'content'] },
  platform: { paths: ['src/platform/'], imports: ['application', 'core'] },
  debug: { paths: ['src/debug/'], imports: ['application', 'core'] },
  // Shared view code, beneath every feature module.
  styles: { paths: ['src/view/styles/'], imports: [] },
  art: { paths: ['src/view/art/'], imports: ['core', 'content'] },
  common: { paths: ['src/view/common/'], imports: ['core', 'content', 'art'] },
  // View feature modules. Fishing includes its motion controls (fishing/motion/) and
  // keeps per-device choices and the device log in platform.
  city: { paths: ['src/view/city/'], imports: VIEW_FEATURE },
  fishing: {
    paths: ['src/view/fishing/'],
    imports: [...VIEW_FEATURE, 'platform'],
  },
  cats: { paths: ['src/view/cats/'], imports: VIEW_FEATURE },
  petting: { paths: ['src/view/petting/'], imports: VIEW_FEATURE },
  companion: { paths: ['src/view/companion/'], imports: VIEW_FEATURE },
  // Assembly: the view entry and the page mount put every screen together.
  shell: {
    paths: ['src/view/shell/', 'src/view/index.ts'],
    imports: [
      ...VIEW_FEATURE,
      'platform',
      'city',
      'fishing',
      'cats',
      'petting',
      'companion',
    ],
  },
  main: {
    paths: ['src/main.ts', 'src/env.d.ts'],
    imports: [
      'application',
      'content',
      'providers',
      'platform',
      'debug',
      'shell',
    ],
  },
});
type ModuleName = keyof typeof MODULES;
const NAMES = Object.keys(MODULES) as ModuleName[];

/** The module owning a repository path, or undefined for none. */
export function moduleOf(path: string): ModuleName | undefined {
  return NAMES.find((name) =>
    MODULES[name].paths.some((owned) =>
      owned.endsWith('/') ? path.startsWith(owned) : path === owned,
    ),
  );
}

/** A file of `from` may import a file of `to`. */
export function importAllowed(from: ModuleName, to: ModuleName): boolean {
  return from === to || MODULES[from].imports.includes(to);
}
