# Project bootstrap plan

Initial inspection: empty directory, no Git repository; macOS arm64, Node 22.19.0, npm 10.9.3. Initialization follows the approved PHASE 1–10 sequence.

1. Product: build a city where persistent cats live and form bonds. BUILD / LIVE / BOND each gets one small working interaction.
2. Loop: 1000 coins → build a 300-coin cafe → advance simulation → earn income → talk to Mochi → save/reload.
3. Architecture: pure Core → snapshots → view adapter → Phaser. Application orchestrates providers and storage.
4. Dual path: rule provider is complete offline functionality; future AI enhances expression with validated proposals and fallback.
5. State: world owns economy, instances, cat history, clock, RNG and identifiers. UI, network clients and rendering are external.
6. Providers: only DialogueProvider is implemented. No speculative provider registry, DI container or SDK.
7. Repository: one npm project, separate core/content/application/providers/platform/view/debug directories; tests by level.
8. Harness: generic Node/Playwright runner, Cat City adapter, task contract, assertions, screenshots, console logs, snapshots and replay.
9. Tests: units first; 30-day invariant simulation; save/provider integration; actual UI E2E; screenshot evidence without automatic baseline approval.
10. CI: npm ci → browser install → npm run check → harness → upload artifacts even on failure.
11. M0: 10×10 map, one cafe, persistent Mochi, basic movement, income, rule dialogue, versioned local save and debug bridge.
12. Risks: avoid abstraction before use; protect engine/AI boundaries; save RNG/counters; reject incompatible saves; use manual time in browser tests.

Implementation order: docs/config → failing Core tests → Core implementation → pass Core tests → minimal Phaser view → bridge/E2E/harness → full regression.

Simplifications: no ECS, monorepo, backend, pathfinding, offline earnings, real LLM, general DSL or separate harness publication. First replay supports the current build and save schema. Cross-version replay needs explicit migrations later.
