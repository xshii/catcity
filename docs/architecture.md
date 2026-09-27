# Architecture

Core owns state and accepts commands; Application orchestrates use cases; Phaser and DOM panels render snapshots. No mutable world reference leaves Core.

## Modules

- core: schemas/types, definitions-independent validation, RandomService, GameClock, commands, simulation, save serialization and World facade.
- content: typed cafe and Mochi definitions, separate from instance state.
- application: dialogue orchestration, fallback, session, command trace and storage coordination.
- providers: structured rule/mock dialogue. No SDK and no direct state mutations.
- platform: localStorage and browser time adapter.
- view: map geometry and scene/panel presentation.
- debug: dev/test bridge with snapshot reads and validated debug commands.
- harness: portable runner contracts plus a game-specific adapter.

## Determinism and ownership

World uses an explicit uint32 seed and persisted RNG state. Time is an integer minute counter. Income progress is per building; cat steps use absolute ten-minute boundaries. IDs come from a persisted monotonic counter. Advancing N minutes once or in chunks yields equal gameplay state.

Commands validate before mutation. Successful commands produce structured events, rejected commands produce error codes. Diagnostics/command traces are outside gameplay state. Application retains initial save and ordered commands for replay; rendering selection and real-time timers are not gameplay truth.

## Persistence

Save envelope: saveVersion=1, contentVersion=1, world. Runtime schema and semantic invariants reject malformed, unsupported or impossible states. Loading returns a new independent World. No migration is needed until v2; add a migration and retain v1 fixture then. Never guess how to interpret future versions.

Browser repository preserves invalid data and disables autosave in that session. Storage errors are visible to the player. No localStorage access from Core.

## Extension boundaries

Provider proposals are parsed and checked, then translated to known commands. Core is still final authority. Future mini-games take MiniGameContext and return MiniGameResult, validated into commands; no direct main-world access.

Debug Bridge is dynamically imported only in development or explicit test mode. Production must expose no bridge or query-parameter bypass. Production E2E checks this separately.

## Deliberate limits

Single npm package; no ECS, dependency-injection framework, event-sourced save, generalized task DSL, real LLM or online services. Structured traces aid replay but are not the save format. Current fixtures and replay are build/schema-specific.
