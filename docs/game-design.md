# Milestone 0 rules

- A new world has a 10×10 map, 1000 integer coins and Mochi at (5, 5).
- One 1×1 Cat Cafe costs 300 coins. Placement must be within the map, unoccupied by a building or cat, and affordable. Only one cafe is allowed in M0.
- Each cafe earns 10 coins per 60 simulation minutes since its construction, retaining partial progress in its instance.
- Simulation time is integer minutes. Every ten minutes Mochi considers a legal neighboring tile, preferring distance ≤2 from the cafe when present. Stable candidate order plus seeded RNG determines movement.
- The browser advances one game minute per real second while visible. Hidden/background time earns nothing in M0. Tests control simulation time directly.
- Mochi is shy, food-loving and slow to warm up; likes fish, quiet and windows. Mood, needs, appearance, traits, preferences, player bond and structured memories persist.
- Talking records a bounded structured interaction memory and increases bond by one at most once per simulation hour. Text alone cannot grant coins, items or other effects.
- Last 50 memories are retained in M0. Long-term summarization/archival is deferred and must be designed before expanding story content.
- Save after successful changes and on explicit Save. Reload restores exact saved state. Corrupt saves are preserved and require user action to replace outside M0.

No offline earnings, needs decay, relationships simulation, construction queues, mini-games or real AI providers are implemented in M0. Home/routine/relationship fields reserve simple data only.
