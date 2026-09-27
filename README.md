# Cat City

A small, deterministic cat city game and the beginning of a reusable AI Game Dev Harness. BUILD / LIVE / BOND. No API key, backend, editor or actual LLM required.

## Start

```sh
npm ci
npx playwright install chromium
npm run dev
```

Use Node 22.19.0 (`.nvmrc`). Open the local Vite URL. Click an empty tile to build the 300-coin cafe; click Mochi to talk. Rest advances one game hour. Saves stay in this browser/device. Invalid saved data is preserved and visibly reported.

## Verify

```sh
npm run check
npm run harness
npm run replay -- artifacts/<run-id>/commands.json
```

`check` requires all type/lint/format/unit/simulation/integration/build/E2E checks to pass. `harness` runs `check`, launches its own server/browser, executes acceptance steps, validates replay, and captures screenshots, world state, console output and traces. A failed prerequisite is a failed run with partial evidence, not a skip. On Linux install browsers with `npx playwright install --with-deps chromium`.

Individual commands: `npm test`, `npm run test:simulation`, `npm run test:integration`, `npm run test:e2e`, `npm run build`, `npm run format`. Preview ports 4173–4175 must be available during verification.

## Structure

```text
src/core          Pure, headless world; commands, clock, RNG, save validation
src/content       Typed cat/building definitions
src/application   Session, dialogue orchestration, replay window
src/providers     Rule-based and mock dialogue
src/platform      Browser save adapter
src/view          Phaser map, DOM panel and view model
src/debug         Development/test-only bridge
tests             Unit, simulation, integration, browser tests and fixtures
harness/runner    Generic process/browser/evidence runner
harness/adapters  Cat City interaction and replay adapter
harness/tasks     Task acceptance contract
docs              Architecture, rules and test strategy
artifacts         Generated evidence, ignored by Git
```

## Debug and reproducibility

Dev and test builds expose `window.CAT_CITY_DEBUG`: snapshots, entities, seed, clock advance, fixture loading, validated cat/coin operations, selection, diagnostics and replay export. Production builds remove the bridge. Test builds disable real-time simulation so browser acceptance is deterministic.

Saves include schema/content versions, seed/current RNG state, integer clock, income remainder, entity IDs and memories. Replay contains a saved starting checkpoint, ordered commands/outcomes and expected final state. Diagnostics rotate after 1000 commands with a fresh checkpoint, retaining exact replay of the remaining window.

## CI

[GitHub Actions workflow](.github/workflows/ci.yml) runs on main pushes, pull requests and manual dispatch. A single standard Ubuntu job runs the Harness, including the full check gate. Superseded runs are cancelled; evidence is retained for three days. No paid runner or service is required. Private repositories consume the owner's included Actions allowance; account billing limits are managed on GitHub, not guaranteed by workflow YAML. See [CI setup](docs/ci.md).

## Scope and next step

M0 includes one cafe, Mochi, basic movement/income, rule dialogue, structured memories and versioned local saves. Needs, relationships, routines and mini-game contracts have no simulation yet. No offline earnings, true pathfinding, real LLM, cloud saves or cross-version replay. Visual evidence is captured; pixel regression baselines are not enabled. Desktop Chromium is the first browser target; mobile packaging and full keyboard map controls remain future work.

Next recommended feature: a validated feed-Mochi interaction that changes hunger and adds a structured memory, using the existing command/provider/test/harness boundaries.

Read [architecture](docs/architecture.md), [game rules](docs/game-design.md), [AI boundary](docs/ai-architecture.md), [test strategy](docs/testing.md), and [agent contract](AGENTS.md) before extending the game.
