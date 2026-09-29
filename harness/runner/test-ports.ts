import { createHash } from 'node:crypto';

/**
 * Ports of one checkout's test servers: the test build, the production build and the
 * acceptance preview. They derive from the checkout's path, so gates in parallel
 * worktrees never collide; `CAT_CITY_TEST_PORT` sets the first one explicitly. The range
 * starts above the device preview (4178), which is never used here. Servers bind with
 * `--strictPort`, so a rare collision fails loudly instead of testing another build.
 */
export function testPorts(
  root: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
) {
  const explicit = Number(env.CAT_CITY_TEST_PORT);
  const slot =
    parseInt(createHash('sha1').update(root).digest('hex').slice(0, 8), 16) %
    200;
  const base =
    Number.isInteger(explicit) && explicit > 0 ? explicit : 4200 + 3 * slot;
  return { test: base, production: base + 1, acceptance: base + 2 };
}

export const localOrigin = (port: number) => `http://127.0.0.1:${port}`;
