import { createCatCityAdapter } from './adapters/catcity/browser';
import { chooseE2E } from './adapters/catcity/e2e';
import { productionSmoke } from './adapters/catcity/production-smoke';
import { cityLoopTask } from './tasks/city-loop';
import { localPreview } from './tasks/local-preview';
import {
  publishLocal,
  publishTest,
  publicationStatus,
  stopPublication,
} from './runner/local-publication';
import { sourceIdentity } from './runner/evidence';
import { runProcess } from './runner/process';
import { buildStamp } from './runner/build-stamp';
import { mkdir } from 'node:fs/promises';
import { runHarness } from './runner/run-harness';
import type { BrowserTestChoice } from './runner/contract';
import { changedSince, headCommit } from './runner/changes';
import {
  fullCheckLog,
  localDate,
  readFullChecks,
  recordFullCheck,
} from './runner/full-checks';

/**
 * A push's E2E specs (user 2026-09-30): every one on the day's first push, until one
 * full check has passed; after that, those the changes since origin/main need.
 */
function pushChoice(log: string, today: string): BrowserTestChoice {
  let changes: ReturnType<typeof changedSince>;
  try {
    changes = changedSince('origin/main');
  } catch (error) {
    return {
      files: 'all',
      notes: [`no merge base with origin/main (${String(error)}): every spec`],
    };
  }
  const choice = chooseE2E({
    changed: changes.files,
    fullChecks: readFullChecks(log),
    today,
  });
  return {
    files:
      choice.files === 'all'
        ? 'all'
        : choice.files.map((name) => `tests/e2e/${name}`),
    notes: [
      `merge base with origin/main: ${changes.base}`,
      `full checks: ${log}`,
      `changed files (${changes.files.length}):`,
      ...changes.files.map((file) => `  ${file}`),
      'why:',
      ...choice.why.map((line) => `  ${line}`),
    ],
  };
}

const command = process.argv[2] ?? 'verify';
if (command === 'verify' || command === 'publish') {
  const log = fullCheckLog();
  const today = localDate(new Date());
  // A release always runs the full check.
  const choice: BrowserTestChoice =
    command === 'publish'
      ? { files: 'all', notes: ['a release: every spec'] }
      : pushChoice(log, today);
  let evidence: string;
  let ok = false;
  try {
    evidence = await runHarness(cityLoopTask, createCatCityAdapter(), choice);
    ok = true;
  } finally {
    if (choice.files === 'all')
      recordFullCheck(log, { date: today, commit: headCommit(), ok });
  }
  if (command === 'publish') {
    const publication = await publishLocal(
      localPreview,
      evidence,
      productionSmoke,
    );
    console.log(`[harness] local preview: ${publication.urls.join(' , ')}`);
    console.log(`[harness] release evidence: ${publication.evidence}`);
  }
} else if (command === 'publish-test') {
  // Try-out release for phones: production build, no gate or smoke; marked unverified.
  const identity = await sourceIdentity();
  await mkdir('artifacts', { recursive: true });
  // When it was built comes first, so the phone's debug stamp says which try-out it is.
  const buildVersion = `test-${buildStamp(new Date())}-${identity.commit?.slice(0, 8) ?? 'local'}-${identity.sourceDigest.slice(0, 6)}`;
  await runProcess(
    'npm',
    ['run', 'build'],
    'artifacts/publish-test-build.log',
    { ...process.env, BUILD_VERSION: buildVersion },
  );
  const publication = await publishTest(localPreview, buildVersion);
  console.log(
    `[harness] UNVERIFIED test preview: ${publication.urls.join(' , ')}`,
  );
} else if (command === 'status') {
  console.log(JSON.stringify(await publicationStatus(localPreview), null, 2));
} else if (command === 'stop') {
  console.log(
    `[harness] ${(await stopPublication(localPreview)) ? 'local preview stopped' : 'no owned local preview is running'}`,
  );
} else {
  throw new Error(
    'Usage: npm run harness -- [verify|publish|publish-test|status|stop]',
  );
}
