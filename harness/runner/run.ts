import { createCatCityAdapter } from '../adapters/catcity/browser';
import { buildCafeTask } from '../tasks/build-cafe';
import { runHarness } from './run-harness';

await runHarness(buildCafeTask, createCatCityAdapter());
