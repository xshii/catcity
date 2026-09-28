import { createCatCityAdapter } from './adapters/catcity/browser';
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
import { mkdir } from 'node:fs/promises';
import { runHarness } from './runner/run-harness';

const command = process.argv[2] ?? 'verify';
if (command === 'verify' || command === 'publish') {
  const evidence = await runHarness(cityLoopTask, createCatCityAdapter());
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
  const buildVersion = `test-${identity.commit?.slice(0, 8) ?? 'local'}-${identity.sourceDigest.slice(0, 12)}`;
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
