import { expect, it } from 'vitest';
import { BOND_LEVELS, bondLevel } from '../../src/content/care';
import {
  BAITS,
  FISHING,
  skillLevel,
  SPOT_IDS,
  spotOpen,
  type BaitId,
  type SpotId,
} from '../../src/content/fishing';
import type { GameCommand } from '../../src/core/commands';
import { RandomService } from '../../src/core/random';
import { applyCommand } from '../../src/core/reducer';
import { createWorld, World } from '../../src/core/world';
import { fishPath } from '../../src/minigames/angling-motion';
import { PLAYERS, rodTip, type Player } from '../helpers/motion-player';

/**
 * Growth pacing (spec 038): how many fish and shared moments each milestone takes. One
 * simulated player fishes with Mochi, and only fishes, from a new game until the skill is
 * full and Mochi is family. Rules and rewards are Core's own: every step is a Core command.
 *
 * Assumptions of the simulation, not of the game:
 * - One cast per game hour: a fish a minute at the 1× clock of the river
 *   (specs/037-cat-life/numbers.md M1), whatever the run itself took.
 * - The player fishes the newest open water with a fixed aim: the skilled one for its best
 *   fish Mochi can land, the novice for a fish of at most 2★.
 * - The hands are those of the fight balance simulation; the lift comes `delay` ticks
 *   into the bite window.
 * Commands go through Core's reducer on one state, since a validated copy per fishing tick
 * is too slow for thousands of casts; the state is validated at the end.
 */
const CAST_MINUTES = 60;
const CAST_LIMIT = 3000;
type Aim = { spotId: SpotId; baitId: BaitId; direction: number };
const POND: Aim = { spotId: 'POND', baitId: 'BREAD', direction: 30 };
const AIMS: Record<'novice' | 'skilled', Aim[]> = {
  // Newest water first: perch, mackerel, perch.
  novice: [
    { spotId: 'MOON', baitId: 'WORM', direction: 30 },
    { spotId: 'COAST', baitId: 'BREAD', direction: 30 },
    { spotId: 'REEDS', baitId: 'WORM', direction: 30 },
    POND,
  ],
  // Koi, sea bream, catfish.
  skilled: [
    { spotId: 'MOON', baitId: 'WORM', direction: -30 },
    { spotId: 'COAST', baitId: 'SHRIMP', direction: 30 },
    { spotId: 'REEDS', baitId: 'SHRIMP', direction: 30 },
    POND,
  ],
};
/** Strong enough for every aimed fish; too strong for bread to hook supplies. */
const POWER = 60;

interface Pace {
  casts: number;
  happyCasts: number;
  /** Fish caught when each waterway opened. */
  opened: Partial<Record<SpotId, number>>;
  fullSkill: number;
  /** Fish caught together when each bond level was reached. */
  bond: number[];
}

function play(player: 'novice' | 'skilled'): Pace {
  const state = createWorld(42).getSnapshot();
  const mochi = state.cats[0]!;
  const hand = new RandomService(104729);
  const { delay, jitter } = PLAYERS[player];
  const wobble = () => hand.nextInt(2 * jitter + 1) - jitter;
  const run = (command: GameCommand) => applyCommand(state, command);
  const pace: Pace = {
    casts: 0,
    happyCasts: 0,
    opened: {},
    fullSkill: 0,
    bond: [0],
  };
  let fish = 0;
  const done = () =>
    pace.fullSkill > 0 && pace.bond.length === BOND_LEVELS.length;
  while (!done() && pace.casts < CAST_LIMIT) {
    const aim = AIMS[player].find((aim) =>
      spotOpen(aim.spotId, state.fishing),
    )!;
    // The pond holds two fish, one to each side.
    const direction =
      aim.spotId === 'POND' && fish % 2 === 0 ? -aim.direction : aim.direction;
    if (mochi.fishingSpotId !== aim.spotId || mochi.walk) {
      if (!mochi.walk)
        run({
          type: 'TRAVEL_TO_FISHING_SPOT',
          catId: mochi.id,
          spotId: aim.spotId,
        });
      run({ type: 'ADVANCE_TIME', minutes: 10 });
      continue;
    }
    if (state.fishing.inventory.length === FISHING.bag.capacity)
      for (const item of [...state.fishing.inventory])
        run({ type: 'SELL_FISH', fishId: item.id });
    if (aim.baitId !== 'BREAD' && state.fishing.baits[aim.baitId] === 0) {
      if (state.coins < BAITS[aim.baitId].price)
        throw new Error(`${player} cannot afford ${aim.baitId}`);
      run({ type: 'BUY_BAIT', baitId: aim.baitId });
    }
    if (mochi.needs.energy < FISHING.cast.staminaCost) {
      run({ type: 'ADVANCE_TIME', minutes: 10 });
      continue;
    }
    run({
      type: 'FISH_BEGIN',
      catId: mochi.id,
      spotId: aim.spotId,
      baitId: aim.baitId,
      direction,
      aimDepth: 50,
      mode: 'motion',
    });
    const runId = state.fishing.active!.id;
    pace.casts++;
    if (state.fishing.active!.happy) pace.happyCasts++;
    run({ type: 'FISH_CAST', runId, power: POWER });
    const still = { type: 'FISH_MOTION_CONTROL', runId, x: 50, y: 50 } as const;
    while (state.fishing.active!.phase === 'waiting')
      run({ ...still, ticks: 1 });
    for (let tick = 0; tick < delay; tick++) run({ ...still, ticks: 1 });
    run({ type: 'FISH_STRIKE', runId });
    const path = state.fishing.active
      ? fishPath(
          state.fishing.active,
          FISHING.motion.fight.graceTicks + FISHING.motion.fight.limitTicks,
        )
      : [];
    while (state.fishing.active)
      run({
        type: 'FISH_MOTION_CONTROL',
        runId,
        ...rodTip(player, state.fishing.active, path, wobble),
        ticks: 1,
      });
    if (state.fishing.lastResult!.caught) {
      fish++;
      for (const spotId of SPOT_IDS)
        if (spotOpen(spotId, state.fishing)) pace.opened[spotId] ??= fish;
      if (skillLevel(state.fishing.xp) === FISHING.skill.maxLevel)
        pace.fullSkill ||= fish;
      while (pace.bond.length <= bondLevel(mochi.playerBond))
        pace.bond.push(fish);
    }
    run({ type: 'ADVANCE_TIME', minutes: CAST_MINUTES });
  }
  // Every shortcut above still left a world that Core accepts and saves.
  const world = new World(state);
  expect(world.save()).toBe(new World(world.getSnapshot()).save());
  return pace;
}

const paces = new Map<string, Pace>();
function paceOf(player: 'novice' | 'skilled'): Pace {
  if (!paces.has(player)) paces.set(player, play(player));
  return paces.get(player)!;
}
const levelNamed = (name: string) =>
  BOND_LEVELS.findIndex((level) => level.name === name);

/**
 * Target ranges from specs/037-cat-life/numbers.md §9: [what, measure, min, max].
 * Measured 2026-09-29 (novice / skilled): reeds 4 / 4, moon lake 52 / 42, full skill
 * 414 / 284, 信任 75 / 75, 家人 750 / 750. The skilled player's 42 fish to the moon lake
 * are under the range: its 3★ fish earn 25 XP each where the design assumed 20. The
 * numbers are the design's and the range is left as it is (spec 038, 已知偏差).
 */
const TARGETS: [string, (pace: Pace) => number, number, number][] = [
  ['fish to open the reeds', (pace) => pace.opened.REEDS!, 4, 8],
  ['fish to open the moon lake', (pace) => pace.opened.MOON!, 45, 70],
  ['fish to full skill', (pace) => pace.fullSkill, 280, 450],
  ['fish together to 信任', (pace) => pace.bond[levelNamed('信任')]!, 50, 90],
  ['fish together to 家人', (pace) => pace.bond[levelNamed('家人')]!, 500, 800],
];
const PLAYER_TYPES = ['novice', 'skilled'] as const satisfies Player[];

it.each(
  PLAYER_TYPES.flatMap((player) =>
    TARGETS.map((target) => [player, ...target] as const),
  ),
)(
  '%s players take the target number of %s',
  (player, what, measure, min, max) => {
    const measured = measure(paceOf(player));
    const message = `${player}: ${measured} ${what}, target ${min}–${max}`;
    expect(measured, message).toBeGreaterThanOrEqual(min);
    expect(measured, message).toBeLessThanOrEqual(max);
  },
);

// Measured 2026-09-29: 0 of 750 casts. At a cast an hour a catch lifts 79 to 82 and the
// hour's drift of 4 brings it back to 78, so no cast begins happy (spec 038, 已知偏差).
it('a skilled player who only fishes has a happy cat on 30–50% of the casts', () => {
  const { casts, happyCasts } = paceOf('skilled');
  const share = Math.round((happyCasts / casts) * 100);
  const message = `${happyCasts} of ${casts} casts were happy: ${share}%`;
  expect(share, message).toBeGreaterThanOrEqual(30);
  expect(share, message).toBeLessThanOrEqual(50);
});
