import { expect, it } from 'vitest';
import { CAT_BREED_IDS, type CatBreed } from '../../src/content/breeds';
import { BOND, BOND_LEVELS, bondLevel, CARE } from '../../src/content/care';
import { CAT_DEFINITIONS } from '../../src/content/cats';
import {
  BAITS,
  FISHING,
  fishById,
  skillLevel,
  SPOT_IDS,
  SPOTS,
  spotOpen,
  type BaitId,
  type FishId,
  type SpotId,
} from '../../src/content/fishing';
import { MOOD } from '../../src/content/mood';
import { WISH, WISH_KINDS, type WishKind } from '../../src/content/wishes';
import { PETTING, type PetSpot } from '../../src/content/petting';
import {
  commandSchema,
  type GameCommand,
  type GameEvent,
} from '../../src/core/commands';
import { nextBuildingPrice } from '../../src/core/city/customers';
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
 *   fish Mochi can land, the novice for a fish of at most 2★. Mochi is the stray the game
 *   starts with (spec 041 T-14), of each breed in turn: at the moon lake a ragdoll lands
 *   koi, a shorthair moon carp, and a domestic cat perch, as the other two wait for
 *   invited cats of those breeds.
 * - The gifting player has the skilled hands. While a gift still counts that game day and
 *   the water holds one of Mochi's favourites, it casts bread for that fish and gives it
 *   at once; otherwise it fishes like the skilled player.
 * - The hands are those of the fight balance simulation; the lift comes `delay` ticks
 *   into the bite window.
 * - The petting player (spec 041 R-23) has the skilled hands. Between casts, while the cat
 *   is not happy and the allowance still has a round that lifts mood, it pets one round,
 *   perfectly (`PERFECT`); the round's own time is inside the rhythm.
 * - The wishing player (spec 041 R-50 – R-53) grants each of Mochi's wishes as soon as it
 *   can: it builds the home and the cafe beside it, pets one perfect round, fishes the
 *   wished water, or fishes for the wished fish (`WISHED_AIMS`) and gives it. The novice
 *   leaves a fish of more than 2★ for another day. Otherwise it fishes as they do.
 * - The city clock: the river runs at 1×, but the time between casts may be spent in the
 *   city at 4×. There the same real rhythm passes four times the game minutes.
 */
/** Game minutes from one cast to the next. */
const RHYTHMS = [20, 30, 45, 60] as const;
const CAST_LIMIT = 3000;
type Aim = {
  spotId: SpotId;
  baitId: BaitId;
  direction: number;
  power?: number;
};
const POND: Aim = { spotId: 'POND', baitId: 'BREAD', direction: 30 };
const AIMS: Record<'novice' | 'skilled', Aim[]> = {
  // Newest water first: perch, mackerel, perch.
  novice: [
    { spotId: 'MOON', baitId: 'WORM', direction: 30 },
    { spotId: 'COAST', baitId: 'BREAD', direction: 30 },
    { spotId: 'REEDS', baitId: 'WORM', direction: 30 },
    POND,
  ],
  // The moon lake's best for the breed (MOON_BEST), sea bream, catfish.
  skilled: [
    { spotId: 'MOON', baitId: 'WORM', direction: -30 },
    { spotId: 'COAST', baitId: 'SHRIMP', direction: 30 },
    { spotId: 'REEDS', baitId: 'SHRIMP', direction: 30 },
    POND,
  ],
};
/** The skilled player's aim at the moon lake: the best fish Mochi of each breed can land. */
const MOON_BEST: Record<CatBreed, Aim> = {
  RAGDOLL: { spotId: 'MOON', baitId: 'WORM', direction: -30 },
  BRITISH_SHORTHAIR: {
    spotId: 'MOON',
    baitId: 'SHRIMP',
    direction: 30,
    power: FISHING.encounter.moonCarpPower,
  },
  DOMESTIC: { spotId: 'MOON', baitId: 'WORM', direction: 30 },
};
/** Strong enough for every other aimed fish; too strong for bread to hook supplies. */
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
  /** Wishes granted, of which kinds, and by the time Mochi became family with the bond then. */
  wishes: number;
  kinds: Set<WishKind>;
  family: { wishes: number; bond: number } | null;
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

type Style = 'fishing' | 'always happy' | 'gifting' | 'petting' | 'wishing';

/** Where a player aims for each fish Mochi may wish for: its water, bait and side. */
const WISHED_AIMS: Record<FishId, Aim> = {
  SILVER: { spotId: 'POND', baitId: 'BREAD', direction: -30 },
  CRUCIAN: { spotId: 'POND', baitId: 'BREAD', direction: 30 },
  PERCH: { spotId: 'REEDS', baitId: 'WORM', direction: 30 },
  CATFISH: { spotId: 'REEDS', baitId: 'SHRIMP', direction: 30 },
  KOI: { spotId: 'MOON', baitId: 'WORM', direction: -30 },
  MOON_CARP: MOON_BEST.BRITISH_SHORTHAIR,
  MACKEREL: { spotId: 'COAST', baitId: 'BREAD', direction: 30 },
  SEA_BREAM: { spotId: 'COAST', baitId: 'SHRIMP', direction: 30 },
};
/** Seed 42's plots for the home and the cafe a wishing player builds: one tile apart. */
const HOME_PLOT = { x: 4, y: 3 };
const CAFE_PLOT = { x: 4, y: 4 };

/** A new game whose stray is Mochi of `breed`, in its template's look. */
const newGame = (breed: CatBreed) =>
  createWorld(42, { breed, appearance: CAT_DEFINITIONS.MOCHI.appearance });

function play(
  player: 'novice' | 'skilled',
  minutes: number,
  style: Style,
  breed: CatBreed,
  clock: number,
): Pace {
  const state = newGame(breed).getSnapshot();
  const aims = AIMS[player].map((aim) =>
    player === 'skilled' && aim.spotId === 'MOON' ? MOON_BEST[breed] : aim,
  );
  const mochi = state.cats[0]!;
  const { favourite } = pettingTastes(state.seed, mochi.id);
  const hand = new RandomService(104729);
  const { delay, jitter } = PLAYERS[player];
  const wobble = () => hand.nextInt(2 * jitter + 1) - jitter;
  const pace: Pace = {
    casts: 0,
    wishes: 0,
    kinds: new Set(),
    family: null,
    happyCasts: 0,
    gifts: 0,
    pets: 0,
    opened: {},
    fullSkill: 0,
    bond: [0],
  };
  const counted = (events: GameEvent[]) => {
    for (const event of events)
      if (event.type === 'WishFulfilled') {
        pace.wishes++;
        pace.kinds.add(event.kind);
      }
  };
  const run = (command: GameCommand) =>
    counted(applyCommand(state, commandSchema.parse(command)));
  /** A rod input like the one before it, already checked. */
  const tick = (command: GameCommand) => counted(applyCommand(state, command));
  const wishing = style === 'wishing';
  let fish = 0;
  const done = () =>
    pace.fullSkill > 0 && pace.bond.length === BOND_LEVELS.length;
  while (!done() && pace.casts < CAST_LIMIT) {
    // A home, or a cafe beside it, is granted as soon as it is built.
    const building = !wishing
      ? null
      : mochi.wish?.kind === 'HOME'
        ? 'CAT_APARTMENT'
        : mochi.wish?.kind === 'CAFE'
          ? 'CAT_CAFE'
          : null;
    if (building && state.coins >= nextBuildingPrice(state, building)) {
      run({
        type: 'BUILD_BUILDING',
        buildingType: building,
        position: building === 'CAT_CAFE' ? CAFE_PLOT : HOME_PLOT,
      });
      if (building === 'CAT_APARTMENT')
        run({
          type: 'ASSIGN_HOME',
          catId: mochi.id,
          buildingId: state.buildings.at(-1)!.id,
        });
    }
    const water = aims.find((aim) => spotOpen(aim.spotId, state.fishing))!;
    const giftCounts =
      style === 'gifting' &&
      spendDaily(mochi.giftBond, state.minute, BOND.giftsPerDay) !== null;
    // The novice leaves a wish for a fish of more than 2★ for another day.
    const wish =
      wishing &&
      !(
        player === 'novice' &&
        mochi.wish?.kind === 'FISH' &&
        fishById(mochi.wish.target as FishId).stars > 2
      )
        ? mochi.wish
        : null;
    const wished =
      wish?.kind === 'FISH'
        ? WISHED_AIMS[wish.target as FishId]
        : wish?.kind === 'OUTING'
          ? aims.find((aim) => aim.spotId === wish.target)!
          : null;
    // Bread brings the pond fish, Mochi's favourites, wherever they live.
    const aim =
      wished ??
      (giftCounts &&
      SPOTS[water.spotId].fish.some((id) => mochi.favoriteFish.includes(id))
        ? { ...POND, spotId: water.spotId }
        : water);
    // The pond fish keep to their sides: one to the left, one to the right.
    const direction =
      aim.baitId === 'BREAD' && fish % 2 === 0 && wish?.kind !== 'FISH'
        ? -aim.direction
        : aim.direction;
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
      (style === 'petting' &&
        mochi.mood < MOOD.happy &&
        pettingLiftsLeft(mochi, state.minute) > 0) ||
      (wishing && mochi.wish?.kind === 'PETTING')
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
    run({ type: 'FISH_CAST', runId, power: aim.power ?? POWER });
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
      if (wish?.kind === 'FISH' && wish.target === caught.speciesId)
        run({ type: 'GIFT_FISH', fishId: caught.id, catId: mochi.id });
      else if (giftCounts && mochi.favoriteFish.includes(caught.speciesId)) {
        run({ type: 'GIFT_FISH', fishId: caught.id, catId: mochi.id });
        pace.gifts++;
      }
      while (pace.bond.length <= bondLevel(mochi.playerBond))
        pace.bond.push(fish);
      if (pace.bond.length === BOND_LEVELS.length)
        pace.family ??= { wishes: pace.wishes, bond: mochi.playerBond };
    }
    run({ type: 'ADVANCE_TIME', minutes: minutes * clock });
  }
  // Every shortcut above still left a world that Core accepts and saves.
  const world = new World(state);
  expect(world.save()).toBe(new World(world.getSnapshot()).save());
  return pace;
}

const paces = new Map<string, Pace>();
function paceOf(
  breed: CatBreed,
  player: 'novice' | 'skilled',
  minutes: number,
  style: Style = 'fishing',
  clock = 1,
): Pace {
  const key = `${breed} ${player} ${minutes} ${style} ${clock}`;
  if (!paces.has(key))
    paces.set(key, play(player, minutes, style, breed, clock));
  return paces.get(key)!;
}
const levelNamed = (name: string) =>
  BOND_LEVELS.findIndex((level) => level.name === name);

/**
 * Target ranges from specs/037-cat-life/numbers.md §9: [what, measure, min, max].
 * Measured 2026-09-30, the same at every rhythm (novice / skilled): reeds 5 / 5, moon
 * lake 56 / 46, full skill 448 / 307, 信任 75 / 75, 家人 750 / 750. The moon lake and
 * full skill figures sit on the edges of their ranges; no other coefficient fits both.
 * By the stray's breed (T-14) only the skilled full skill moves: ragdoll 307, shorthair
 * 308–309 (moon carp), domestic 437–438 (perch, near the top of its range).
 */
const TARGETS: [string, (pace: Pace) => number, number, number][] = [
  ['fish to open the reeds', (pace) => pace.opened.REEDS!, 4, 8],
  ['fish to open the moon lake', (pace) => pace.opened.MOON!, 45, 70],
  ['fish to full skill', (pace) => pace.fullSkill, 280, 450],
  ['fish together to 信任', (pace) => pace.bond[levelNamed('信任')]!, 50, 90],
  ['fish together to 家人', (pace) => pace.bond[levelNamed('家人')]!, 500, 800],
];
const PLAYER_TYPES = ['novice', 'skilled'] as const satisfies Player[];

// One case per breed, player and rhythm, so each stays small (paces are cached across cases).
const CASES = CAT_BREED_IDS.flatMap((breed) =>
  PLAYER_TYPES.flatMap((player) =>
    RHYTHMS.map((minutes) => [breed, player, minutes] as const),
  ),
);
it.each(CASES)(
  'with a %s stray, %s players casting every %i game minutes reach each milestone within its target',
  (breed, player, minutes) => {
    for (const [what, measure, min, max] of TARGETS) {
      const measured = measure(paceOf(breed, player, minutes));
      const message = `${breed} ${player} at ${minutes}: ${measured} ${what}, target ${min}–${max}`;
      expect(measured, message).toBeGreaterThanOrEqual(min);
      expect(measured, message).toBeLessThanOrEqual(max);
    }
  },
);

// A catch never lifts mood into the happy band (spec 038), so fishing alone earns no
// happy cast at any rhythm: happiness takes a gift or petting.
it.each(CASES)(
  'with a %s stray, %s players who only fish, casting every %i game minutes, never begin a cast with a happy cat',
  (breed, player, minutes) => {
    const { casts, happyCasts } = paceOf(breed, player, minutes);
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

it.each(
  CAT_BREED_IDS.flatMap((breed) =>
    PLAYER_TYPES.map((player) => [breed, player] as const),
  ),
)(
  'an always happy %s stray still takes a %s player the floor number of fish',
  (breed, player) => {
    const pace = paceOf(breed, player, 30, 'always happy');
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
 * With a domestic stray (T-14) full skill takes 412 / 417 / 424 / 429 fish.
 */
const GIFTING = {
  family: 500,
  happyShareMax: 50,
  moonLake: 40,
  fullSkill: 250,
};

it.each(
  CAT_BREED_IDS.flatMap((breed) =>
    RHYTHMS.map((minutes) => [breed, minutes] as const),
  ),
)(
  'with a %s stray, a player who gives every favourite that counts, casting every %i game minutes, cannot rush',
  (breed, minutes) => {
    const pace = paceOf(breed, 'skilled', minutes, 'gifting');
    const share = Math.round((pace.happyCasts / pace.casts) * 100);
    const at = `${breed} at ${minutes}`;
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
 * Measured 2026-09-30 (4 rounds in 10 hours): 3 rounds from every minute. An attentive
 * player (the balance simulation's, +6 to +7 a round) needs 3 or 4, 3.63 on average; with
 * 3 rounds in 8 hours only about a third got there without waiting for the window.
 */
it.each(CAT_BREED_IDS)(
  'a perfect petting player makes a calm %s stray happy in 2–3 rounds, from any minute of the hour',
  (breed) => {
    const ROUND_MINUTES = PETTING.roundTicks / PETTING.ticksPerSecond;
    const base = newGame(breed).getSnapshot();
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
    expect(CARE.pettingLifts.rounds).toBeGreaterThanOrEqual(
      Math.max(...needed),
    );
  },
);

/**
 * R-23 (spec 041): a player who pets between casts has a happy cat on 70–85% of its casts.
 * The allowance of rounds that lift mood (`CARE.pettingLifts`, 4 rounds in 10 hours, user
 * 2026-09-30) keeps it from 100%: a round keeps the cat happy for about two hours.
 * Measured 2026-09-30 at 30 / 60: 80% / 80%; 3 rounds in 7 hours 78% / 85%, 8 hours
 * 75% / 75%, 9 hours 66% / 66%, 4 rounds in 11 hours 72% / 73%. The attentive player:
 * 62% / 60% (58% / 56% with 3 rounds in 8 hours).
 */
const PETTING_HAPPY = { min: 70, max: 85 };

it.each(
  CAT_BREED_IDS.flatMap((breed) =>
    [30, 60].map((minutes) => [breed, minutes] as const),
  ),
)(
  'with a %s stray, a player who pets between casts, casting every %i game minutes, has a happy cat on 70–85% of casts',
  (breed, minutes) => {
    const pace = paceOf(breed, 'skilled', minutes, 'petting');
    const share = Math.round((pace.happyCasts / pace.casts) * 100);
    expect(pace.pets).toBeGreaterThan(0);
    expect(share, `${breed} happy share at ${minutes}`).toBeGreaterThanOrEqual(
      PETTING_HAPPY.min,
    );
    expect(share, `${breed} happy share at ${minutes}`).toBeLessThanOrEqual(
      PETTING_HAPPY.max,
    );
  },
);

/**
 * Wishes (spec 041 R-53): a player who grants every wish still takes 500–800 fish to 家人,
 * at every rhythm, on either city clock. A wish comes at most once a game day and a catch
 * every cast, so the wishes' share of the bond grows with the game minutes between casts.
 * Measured 2026-09-30 (a wish on half of the days, +10), skilled, at 20 / 30 / 45 / 60:
 * 1×: 家人 677–711 fish, the wishes' share 3.3 / 4.7 / 6.0 / 7.3%;
 * 4×: 家人 514–647 fish, the share 10.7 / 16.0 / 22.7–23.2 / 27.3%.
 * The novice: 750 at 1×, where its first wish, a fish of 3★, stays; 717–750 at 4×.
 * The share stays under R-53's 30%. Its floor of 15% holds at no rhythm of 1×: there a
 * game day passes in 24 real minutes of fishing, which bring ten times a wish's points.
 */
const WISH_SHARE_MAX = 30;
const CLOCKS = [1, 4] as const;

it.each(
  CASES.flatMap(([breed, player, minutes]) =>
    CLOCKS.map((clock) => [breed, player, minutes, clock] as const),
  ),
)(
  'with a %s stray, a %s player who grants every wish, casting every %i minutes at %i×, still takes 500–800 fish to 家人',
  (breed, player, minutes, clock) => {
    const pace = paceOf(breed, player, minutes, 'wishing', clock);
    const family = pace.bond[levelNamed('家人')]!;
    const at = `${breed} ${player} at ${minutes} ${clock}×`;
    expect(family, `家人 ${at}`).toBeGreaterThanOrEqual(500);
    expect(family, `家人 ${at}`).toBeLessThanOrEqual(800);
    const share = (pace.family!.wishes * WISH.bond * 100) / pace.family!.bond;
    expect(share, `wishes' share ${at}`).toBeLessThanOrEqual(WISH_SHARE_MAX);
  },
);

it('a skilled player who grants every wish grants every kind of wish in a play', () => {
  const pace = paceOf('RAGDOLL', 'skilled', 60, 'wishing', 4);
  expect(pace.wishes).toBeGreaterThan(WISH_KINDS.length);
  expect([...pace.kinds].sort()).toEqual([...WISH_KINDS].sort());
});
