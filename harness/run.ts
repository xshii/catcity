import { createCatCityAdapter } from './adapters/catcity/browser';
import { productionSmoke } from './adapters/catcity/production-smoke';
import { cityLoopAcceptance, cityLoopTask } from './tasks/city-loop';
import { localPreview } from './tasks/local-preview';
import {
  publishLocal,
  publicationStatus,
  stopPublication,
} from './runner/local-publication';
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
} else if (command === 'acceptance') {
  await runHarness(cityLoopAcceptance, createCatCityAdapter());
} else if (command === 'status') {
  console.log(JSON.stringify(await publicationStatus(localPreview), null, 2));
} else if (command === 'stop') {
  console.log(
    `[harness] ${(await stopPublication(localPreview)) ? 'local preview stopped' : 'no owned local preview is running'}`,
  );
} else {
  throw new Error(
    'Usage: npm run harness -- [verify|publish|acceptance|status|stop]',
  );
}
