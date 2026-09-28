# Cat City engineering contract

Read README.md and docs/architecture.md before changing architecture. This is a long-lived game and a small reusable AI Game Dev Harness.

- Game Core is truth; Phaser renders; AI proposes. Never mutate the world through a view, provider, or debug snapshot.
- Core/content are pure TypeScript: no DOM, Phaser, network, real clock, model SDK, global singleton or Math.random. Use persisted seeded RNG and integer simulation time.
- All mutations go through validated commands. Rejected commands leave world state unchanged. Return structured errors and record command outcomes.
- Definitions and instances are separate. Keep modules small; add abstractions only when used. No generic GameManager or Utils dumping ground.
- AI must be optional. The current prototype uses rule-based/mock dialogue only; no actual LLM. Validate proposals before commands; validate commands again in Core.
- Saves are versioned and runtime-validated. The user permits breaking old saves during this prototype phase: reject incompatible saves and offer an explicit reset, without silently replacing old/corrupt/future-version data. Keep old fixtures as rejection cases; migrations and legacy gameplay command aliases are out of scope. Maintain only the current gameplay path; unsupported sensor/browser fallback is still required.
- Gameplay randomness is separate from narrative/generative randomness. Seed, simulation counters and ID allocation must survive save/load; RNG streams derive from them, and derivable values are not saved.
- Debug Bridge exists only in dev/test builds. Harness runner must remain game-agnostic; game semantics belong in the adapter.
- Use the documented public layer entries. Application owns dependency ports; main injects storage and dialogue implementations. No dependency injection container or unused interfaces.
- Write behavior tests before Core changes. Unit/simulation tests carry most logic coverage; E2E checks actual inputs, bridge state, persistence and console errors.
- Do not delete failing tests, suppress type errors or automatically accept visual baselines to pass checks.
- Run npm run check before calling a feature complete. Run npm run harness for changes to the playable loop, bridge or evidence collection. Inspect the screenshot.
- Definition of Done: acceptance assertions pass, full gate passes, docs match code, evidence paths and known limits reported. A missing browser/test is a failure, not a skip.
- Never push to main. Push a branch and open a pull request. The pre-push hook runs the full gate (`npm run harness`) locally; remote CI runs only static checks and headless tests. Never bypass the hook with `--no-verify`.
- Keep commits small and reversible. Do not commit dependencies, generated build output, private data or artifacts. Do not publish or send messages without authorization.
- New systems such as offline earnings, daily schedules, additional mini-games and actual LLM providers are outside the current scope until requested.
