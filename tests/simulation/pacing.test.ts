import { expect, it } from 'vitest';
import { BOND, BOND_LEVELS, bondLevel, CARE } from '../../src/content/care';
import {
  BAITS,
  FISHING,
  skillLevel,
  SPOT_IDS,
  SPOTS,
  spotOpen,
  type BaitId,
  type SpotId,
} from '../../src/content/fishing';
import { MOOD } from '../../src/content/mood';
import { PETTING, type PetSpot } from '../../src/content/petting';
import { commandSchema, type GameCommand } from '../../src/core/commands';
import { spendDaily } from '../../src/core/bond';
import { MAX_STAT } from '../../src/core/limits';
import { pettingLiftsLeft, pettingTastes } from '../../src/core/petting';
import { RandomService } from '../../src/core/random';
import { applyCommand } from '../../src/core/reducer';
import { createWorld, World } from '../../src/core/world';
import { fishPath, motionSchedule } from '../../src/minigames/angling-motion';
import { PLAYERS, rodTip, type Player } from '../helpers/motion-player';

/**
 * Growth pacing (spec 038): how many fish each milestone takes. One simulated player
 * fishes with Mochi from a new game until the skill is full and Mochi is family.
 *
 * What is Core's and what is not:
 * - Every change to the world is a command applied by Core's reducer, so rules and
 *   rewards are the game's own. Commands are checked by Core's command schema, except
 *   the rod's tick inputs after the first of each cast: they differ only in the point
 *   and the tick count, and checking all of them triples the time of a run.
 * - The commands are applied to one state in place. `World.dispatch` copies and validates
 *   the whole world for every command, which is too slow for some 170 000 of them a run;
 *   the state is validated as a world once, when the run ends. A rejected command throws.
 * - The always happy player's mood is written into the state before each cast. No command
 *   can do that, petting included: it is the bound on growth.
 *
 * Assumptions of the simulation, not of the game:
 * - A steady rhythm: one cast every `minutes` of game time, whatever the run itself took.
 *   A fish a minute at the river's 1× clock is 60 (specs/037-cat-life/numbers.md M1);
 *   real play is nearer 30–45. Every target must hold at every rhythm, so that growth
 *   does not depend on how fast the player casts.
 * - The player fishes the newest open water with a fixed aim: the skilled one for its best
 *   fish Mochi can land, the novice for a fish of at most 2★.
 * - The gifting player has the skilled hands. While a gift still counts that game day and
 *   the water holds one of Mochi's favourites, it casts bread for that fish and gives it
 *   at once; otherwise it fishes like the skilled player.
 * - The hands are those of the fight balance simulation; the lift comes `delay` ticks
 *   into the bite window.
 * - The petting player (spec 041 R-23) has the skilled hands. Between casts, while the cat
 *   is not happy and the allowance still has a round that lifts mood, it pets one round,
 *   perfectly (`PERFECT`); the round's own time is inside the rhythm.
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
/**
 * The best petting there is (design.md 12): the cat's favourite spot, twice in every purr,
 * unhurried. It fills the meter: a round worth the most mood.
 */
const PERFECT = (favourite: PetSpot) =>
  Array.from(
    { length: (2 * PETTING.roundTicks) / PETTING.purr.periodTicks },
    (_, stroke) => ({
      tick:
        Math.floor(stroke / 2) * PETTING.purr.periodTicks +
        (stroke % 2) * Math.floor(PETTING.purr.windowTicks / 2),
      spot: favourite,
    }),
  );

interface Pace {
  casts: number;
  happyCasts: number;
  /** Gifts that counted. */
  gifts: number;
  /** Rounds of petting. */
  pets: number;
  /** Fish caught when each waterway opened. */
  opened: Partial<Record<SpotId, number>>;
  fullSkill: number;
  /** Fish caught together when each bond level was reached. */
  bond: number[];
}

type Style = 'fishing' | 'always happy' | 'gifting' | 'petting';

function play(
  player: 'novice' | 'skilled',
  minutes: number,
  style: Style,
): Pace {
  const state = createWorld(42).getSnapshot();
  const mochi = state.cats[0]!;
  const { favourite } = pettingTastes(state.seed, mochi.id);
  const hand = new RandomService(104729);
  const { delay, jitter } = PLAYERS[player];
  const wobble = () => hand.nextInt(2 * jitter + 1) - jitter;
  const run = (command: GameCommand) =>
    applyCommand(state, commandSchema.parse(command));
  /** A rod input like the one before it, already checked. */
  const tick = (command: GameCommand) => applyCommand(state, command);
  const pace: Pace = {
    casts: 0,
    happyCasts: 0,
    gifts: 0,
    pets: 0,
    opened: {},
    fullSkill: 0,
    bond: [0],
  };
  let fish = 0;
  const done = () =>
    pace.fullSkill > 0 && pace.bond.length === BOND_LEVELS.length;
  while (!done() && pace.casts < CAST_LIMIT) {
    const water = AIMS[player].find((aim) =>
      spotOpen(aim.spotId, state.fishing),
    )!;
    const giftCounts =
      style === 'gifting' &&
      spendDaily(mochi.giftBond, state.minute, BOND.giftsPerDay) !== null;
    // Bread brings the pond fish, Mochi's favourites, wherever they live.
    const aim =
      giftCounts &&
      SPOTS[water.spotId].fish.some((id) => mochi.favoriteFish.includes(id))
        ? { ...POND, spotId: water.spotId }
        : water;
    // The pond fish keep to their sides: one to the left, one to the right.
    const direction =
      aim.baitId === 'BREAD' && fish % 2 === 0 ? -aim.direction : aim.direction;
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
    // Beyond any player: no command keeps a cat this happy.
    if (style === 'always happy') mochi.mood = MAX_STAT;
    if (
      style === 'petting' &&
      mochi.mood < MOOD.happy &&
      pettingLiftsLeft(mochi, state.minute) > 0
    ) {
      run({ type: 'PET_CAT', catId: mochi.id, strokes: PERFECT(favourite) });
      pace.pets++;
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
    // Nothing to decide while waiting: the ticks go in batches, which give the same
    // state as single ticks (tests/simulation/angling).
    const bite = motionSchedule(state.fishing.active!).bite;
    run({ ...still, ticks: 1 });
    while (state.fishing.active!.phase === 'waiting')
      tick({
        ...still,
        ticks: Math.min(
          FISHING.input.maxTicks,
          bite - state.fishing.active!.phaseTick,
        ),
      });
    for (let late = 0; late < delay; late++) tick({ ...still, ticks: 1 });
    run({ type: 'FISH_STRIKE', runId });
    const path = state.fishing.active
      ? fishPath(
          state.fishing.active,
          FISHING.motion.fight.graceTicks + FISHING.motion.fight.limitTicks,
        )
      : [];
    while (state.fishing.active)
      tick({
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
      const caught = state.fishing.inventory.at(-1)!;
      if (giftCounts && mochi.favoriteFish.includes(caught.speciesId)) {
        run({ type: 'GIFT_FISH', fishId: caught.id, catId: mochi.id });
        pace.gifts++;
      }
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
function paceOf(
  player: 'novice' | 'skilled',
  minutes: number,
  style: Style = 'fishing',
): Pace {
  const key = `${player} ${minutes} ${style}`;
  if (!paces.has(key)) paces.set(key, play(player, minutes, style));
  return paces.get(key)!;
}
const levelNamed = (name: string) =>
  BOND_LEVELS.findIndex((level) => level.name === name);

/**
 * Target ranges from specs/037-cat-life/numbers.md §9: [what, measure, min, max].
 * Measured 2026-09-30, the same at every rhythm (novice / skilled): reeds 5 / 5, moon
 * lake 56 / 46, full skill 448 / 307, 信任 75 / 75, 家人 750 / 750. The moon lake and
 * full skill figures sit on the edges of their ranges; no other coefficient fits both.
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

// A catch never lifts mood into the happy band (spec 038), so fishing alone earns no
// happy cast at any rhythm: happiness takes a gift or petting.
it.each(
  PLAYER_TYPES.flatMap((player) =>
    RHYTHMS.map((minutes) => [player, minutes] as const),
  ),
)(
  '%s players who only fish, casting every %i game minutes, never begin a cast with a happy cat',
  (player, minutes) => {
    const { casts, happyCasts } = paceOf(player, minutes);
    expect(casts).toBeGreaterThan(0);
    expect(happyCasts).toBe(0);
  },
);

/**
 * The bound on growth: a cat that is happy on every cast. It may fall under the normal
 * ranges; these floors keep even that player from rushing the skill.
 * Measured 2026-09-30 (novice / skilled): moon lake 38 / 32, full skill 299 / 206,
 * 信任 50 / 50, 家人 500 / 500.
 */
const FASTEST = { moonLake: 30, fullSkill: 190 };

it.each(PLAYER_TYPES)(
  'an always happy cat still takes a %s player the floor number of fish',
  (player) => {
    const pace = paceOf(player, 30, 'always happy');
    expect(pace.happyCasts).toBe(pace.casts);
    expect(pace.opened.MOON, 'moon lake').toBeGreaterThanOrEqual(
      FASTEST.moonLake,
    );
    expect(pace.fullSkill, 'full skill').toBeGreaterThanOrEqual(
      FASTEST.fullSkill,
    );
  },
);

/**
 * Gifts count only three times a game day for each cat (spec 038), so giving away every
 * favourite cannot rush the bond or keep the cat happy. Floors, as for the always happy
 * cat: the gifting player is faster than the fishing one.
 * Measured 2026-09-30 at 20 / 30 / 45 / 60: 家人 643 / 626 / 601 / 583 fish, happy casts
 * 16% / 15% / 13% / 12%, moon lake 43 / 44 / 45 / 45, full skill 291 / 297 / 306 / 313.
 */
const GIFTING = {
  family: 500,
  happyShareMax: 50,
  moonLake: 40,
  fullSkill: 250,
};

it.each(RHYTHMS)(
  'a player who gives every favourite that counts, casting every %i game minutes, cannot rush',
  (minutes) => {
    const pace = paceOf('skilled', minutes, 'gifting');
    const share = Math.round((pace.happyCasts / pace.casts) * 100);
    const at = `at ${minutes}`;
    expect(pace.gifts, `gifts ${at}`).toBeGreaterThan(0);
    expect(pace.bond[levelNamed('家人')], `家人 ${at}`).toBeGreaterThanOrEqual(
      GIFTING.family,
    );
    expect(share, `happy share ${at}`).toBeLessThanOrEqual(
      GIFTING.happyShareMax,
    );
    expect(pace.opened.MOON, `moon lake ${at}`).toBeGreaterThanOrEqual(
      GIFTING.moonLake,
    );
    expect(pace.fullSkill, `full skill ${at}`).toBeGreaterThanOrEqual(
      GIFTING.fullSkill,
    );
  },
);

/**
 * R-23 (spec 041): from calm (60) to happy takes 2–3 rounds of petting one after another,
 * each 12 game minutes at the 1× clock petting holds. The best petting player measures it
 * (user 2026-09-30); it must hold from any minute of the hour, a clock hour between rounds
 * or not, and within the allowance.
 * Measured 2026-09-30: 3 rounds from every minute. An attentive player (the balance
 * simulation's, +6 to +7 a round) needs 3 rounds only about a third of the time; the
 * rest wait for the window.
 */
it('a perfect petting player makes a calm cat happy in 2–3 rounds, from any minute of the hour', () => {
  const ROUND_MINUTES = PETTING.roundTicks / PETTING.ticksPerSecond;
  const base = createWorld(42).getSnapshot();
  const { favourite } = pettingTastes(base.seed, base.cats[0]!.id);
  const needed = new Set<number>();
  for (let start = 0; start < 60; start++) {
    const state = structuredClone(base);
    const mochi = state.cats[0]!;
    applyCommand(state, {
      type: 'ADVANCE_TIME',
      minutes: 60 - (state.minute % 60) + start,
    });
    mochi.mood = 60;
    let rounds = 0;
    while (mochi.mood < MOOD.happy && rounds < 10) {
      if (rounds)
        applyCommand(state, { type: 'ADVANCE_TIME', minutes: ROUND_MINUTES });
      applyCommand(
        state,
        commandSchema.parse({
          type: 'PET_CAT',
          catId: mochi.id,
          strokes: PERFECT(favourite),
        }),
      );
      rounds++;
    }
    needed.add(rounds);
  }
  expect(Math.min(...needed)).toBeGreaterThanOrEqual(2);
  expect(Math.max(...needed)).toBeLessThanOrEqual(3);
  expect(CARE.pettingLifts.rounds).toBeGreaterThanOrEqual(Math.max(...needed));
});

/**
 * R-23 (spec 041): a player who pets between casts has a happy cat on 70–85% of its casts.
 * The allowance of rounds that lift mood (`CARE.pettingLifts`, user 2026-09-30) keeps it
 * from 100%: a round keeps the cat happy for about two hours.
 * Measured 2026-09-30 at 30 / 60 (3 rounds in 8 hours): 75% / 75%; 7 hours 78% / 85%,
 * 9 hours 66% / 66%, 4 rounds in 10 hours 80% / 80%. The attentive player: 58% / 58%.
 */
const PETTING_HAPPY = { min: 70, max: 85 };

it.each([30, 60])(
  'a player who pets between casts, casting every %i game minutes, has a happy cat on 70–85% of casts',
  (minutes) => {
    const pace = paceOf('skilled', minutes, 'petting');
    const share = Math.round((pace.happyCasts / pace.casts) * 100);
    expect(pace.pets).toBeGreaterThan(0);
    expect(share, `happy share at ${minutes}`).toBeGreaterThanOrEqual(
      PETTING_HAPPY.min,
    );
    expect(share, `happy share at ${minutes}`).toBeLessThanOrEqual(
      PETTING_HAPPY.max,
    );
  },
);
