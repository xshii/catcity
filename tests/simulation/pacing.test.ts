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
 * - A steady rhythm: one cast every `minutes` of game time, whatever the run itself took.
 *   A fish a minute at the river's 1× clock is 60 (specs/037-cat-life/numbers.md M1);
 *   real play is nearer 30–45. Every target must hold at every rhythm, so that growth
 *   does not depend on how fast the player casts.
 * - The player fishes the newest open water with a fixed aim: the skilled one for its best
 *   fish Mochi can land, the novice for a fish of at most 2★.
 * - The hands are those of the fight balance simulation; the lift comes `delay` ticks
 *   into the bite window.
 * Commands go through Core's reducer on one state, since a validated copy per fishing tick
 * is too slow for thousands of casts; the state is validated at the end.
 */
/** Game minutes from one cast to the next. */
const RHYTHMS = [20, 30, 45, 60] as const;
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

function play(player: 'novice' | 'skilled', minutes: number): Pace {
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
    run({ type: 'ADVANCE_TIME', minutes });
  }
  // Every shortcut above still left a world that Core accepts and saves.
  const world = new World(state);
  expect(world.save()).toBe(new World(world.getSnapshot()).save());
  return pace;
}

const paces = new Map<string, Pace>();
function paceOf(player: 'novice' | 'skilled', minutes: number): Pace {
  const key = `${player} ${minutes}`;
  if (!paces.has(key)) paces.set(key, play(player, minutes));
  return paces.get(key)!;
}
const levelNamed = (name: string) =>
  BOND_LEVELS.findIndex((level) => level.name === name);

/**
 * Target ranges from specs/037-cat-life/numbers.md §9: [what, measure, min, max].
 * Measured 2026-09-30 over the four rhythms (novice / skilled): reeds 4 / 4, moon lake
 * 53–56 / 45–46, full skill 436–442 / 298–304, 信任 63–65 / 63–65, 家人 633–644 / 632–645.
 * The skilled player's moon lake is on the edge of its range.
 */
const TARGETS: [string, (pace: Pace) => number, number, number][] = [
  ['fish to open the reeds', (pace) => pace.opened.REEDS!, 4, 8],
  ['fish to open the moon lake', (pace) => pace.opened.MOON!, 45, 70],
  ['fish to full skill', (pace) => pace.fullSkill, 280, 450],
  ['fish together to 信任', (pace) => pace.bond[levelNamed('信任')]!, 50, 90],
  ['fish together to 家人', (pace) => pace.bond[levelNamed('家人')]!, 500, 800],
];
const PLAYER_TYPES = ['novice', 'skilled'] as const satisfies Player[];

// One case per player and rhythm, so each stays small (paces are cached across cases).
it.each(
  PLAYER_TYPES.flatMap((player) =>
    RHYTHMS.map((minutes) => [player, minutes] as const),
  ),
)(
  '%s players casting every %i game minutes reach each milestone within its target',
  (player, minutes) => {
    for (const [what, measure, min, max] of TARGETS) {
      const measured = measure(paceOf(player, minutes));
      const message = `${player} at ${minutes}: ${measured} ${what}, target ${min}–${max}`;
      expect(measured, message).toBeGreaterThanOrEqual(min);
      expect(measured, message).toBeLessThanOrEqual(max);
    }
  },
);

/**
 * The happy share must not follow the rhythm (spec 038): a catch lifts mood once per
 * cooldown and the hours wear it off, so faster casting earns no more happy casts.
 * Measured 2026-09-30, skilled: 37%, 33%, 35%, 33% at 20, 30, 45 and 60.
 */
const HAPPY_SHARE = { min: 25, max: 50 };

it.each(RHYTHMS)(
  'a skilled player who only fishes, casting every %i game minutes, has a happy cat on 25–50%% of the casts',
  (minutes) => {
    const { casts, happyCasts } = paceOf('skilled', minutes);
    const share = Math.round((happyCasts / casts) * 100);
    const message = `${happyCasts} of ${casts} casts were happy: ${share}%`;
    expect(share, message).toBeGreaterThanOrEqual(HAPPY_SHARE.min);
    expect(share, message).toBeLessThanOrEqual(HAPPY_SHARE.max);
  },
);
