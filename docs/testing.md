# Tests and evidence

Node 22.19.0; npm lockfile is authoritative. Run npm ci, then npx playwright install chromium (Linux CI: add --with-deps).

- npm test: isolated Core unit tests; no browser.
- npm run test:simulation: 30-day seeded invariant and chunk-equivalence checks.
- npm run test:integration: provider failure paths, persistence validation and deterministic continuation.
- npm run test:e2e: builds production and test variants, launches preview servers and performs real canvas/input interactions. Test mode uses manual simulation time.
- npm run check: required type/lint/format/unit/simulation/integration/production-build/E2E gate.
- npm run harness: runs the gate, then a browser acceptance scenario and produces artifacts in artifacts/<run-id>. Failure remains nonzero with partial evidence retained.
- npm run replay -- <path-to-commands.json>: replay initial save and ordered commands; check outcomes and final state.

Harness captures task contract, acceptance results, process logs, browser console/page errors, build/source identifier, seed, initial fixture, operation trace, final snapshot, screenshot and Playwright trace. Runner is independent of Cat City semantics; adapter supplies interaction and state assertions.

Screenshot evidence is manually inspected. No pixel baseline is automatically accepted. Keep a fixed viewport and manual game time in tests. Never hide missing browsers or a failed command behind a skipped test. CI uploads artifacts with always() semantics.
