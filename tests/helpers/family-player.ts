import type { CatBreed } from '../../src/content/breeds';
import { BOND, BOND_LEVELS } from '../../src/content/care';
import {
  CAT_DEFINITIONS,
  INVITABLE_CATS,
  MAX_COMPANIONS,
} from '../../src/content/cats';
import { buildingPrice } from '../../src/content/city';
import { BREED_BOND_LEVEL, castCost } from '../../src/content/family';
import {
  BAITS,
  FISHING,
  SPOTS,
  spotOpen,
  type BaitId,
  type FishId,
  type SpotId,
} from '../../src/content/fishing';
import { MOOD } from '../../src/content/mood';
import { PETTING, type PetSpot } from '../../src/content/petting';
import { spendDaily } from '../../src/core/bond';
import { freeBeds, nextInvitePrice } from '../../src/core/cats';
import { commandSchema, type GameCommand } from '../../src/core/commands';
import { atFishingShore } from '../../src/core/city/walking';
import { findWalkingPath } from '../../src/core/city/path';
import { shoreTiles } from '../../src/core/city/map';
import { breedBlocks, related, type BreedBlock } from '../../src/core/family';
import { pettingLiftsLeft, pettingTastes } from '../../src/core/petting';
import { RandomService } from '../../src/core/random';
import { applyCommand } from '../../src/core/reducer';
import type { CatEntity, Position, WorldState } from '../../src/core/schema';
import { createWorld, World } from '../../src/core/world';
import { fishPath, motionSchedule } from '../../src/minigames/angling-motion';
import { CITY_PLAN } from './city-player';
import { PLAYERS, rodTip } from './motion-player';

/**
 * A player who raises a family line from a new game (spec 041 R-31 – R-35), in real time:
 * how long until the first kitten, and until a cat of the fifth generation.
 *
 * What is Core's: every change is a Core command applied to one state in place, as in
 * tests/simulation/pacing.test.ts (the state is validated as a world when the play
 * ends); the rules, rewards, prices, conditions and inheritance are the game's own.
 *
 * What the player does (assumptions of the simulation, not of the game):
 * - Real time. A cast takes `castSeconds` from one to the next, of which `RUN_SECONDS`
 *   on the rod (the cat recovers no stamina then); a round of petting its 12 seconds; a
 *   chat, a gift, a build, an invitation or a kitten's name a few seconds. The river and
 *   petting hold the city clock at 1× (view/shell/clock-speed.ts); walks and waiting in
 *   the city pass `speed` game minutes a real second (1×, 2× or 4×).
 * - The goal. The next kitten comes from a cat of the newest generation and a partner of
 *   the other sex who is not family, the pair with the least bond still to earn. With no
 *   such partner, a first-generation cat of that sex is invited; with none left, some pair
 *   has one more kitten: another of the newest generation, or one who is no family of a
 *   cat of it (an aunt or an uncle). The player names each kitten's sex (user
 *   2026-09-30): a cat of the line gets the sex with more partners left for it, a partner
 *   the other sex from its cat. Were the city to run out of room (MAX_COMPANIONS) first,
 *   the play would be `stuck` and never get there.
 * - The work. It fishes with whichever of the pair has more bond to earn (a kitten too:
 *   nothing stops it yet), with the hands of the fight balance simulation: the lift
 *   comes `delay` ticks into the bite, give or take the hand's jitter. It fishes the
 *   newest open water, the skilled player for the best fish the cat can land, the novice
 *   for one of at most 2★; it sells every fish it does not give away. When a bed is
 *   missing it builds an apartment on the next plot of the city plan that shuts no cat in;
 *   it pays for bait; idle cats in the way of a walk to the water make room.
 * - Time. With the pair's bond earned and only growing up, resting or the petting
 *   allowance missing, it waits in the city.
 * - Happiness. When nothing but happiness is missing, it pets (perfect rounds) the cat
 *   with more of the allowance left until the other is happy too, then the other.
 * - The caring player (`style: 'caring'`) is the one who knows every shortcut: it also
 *   chats with each of the pair once a game day, and while a cat still has bond to earn it
 *   pets it while petting earns bond that day or while it is on the rod and not happy;
 *   unless it saves for a bed or an invitation, it casts bread for a favourite fish of
 *   either while its gifts still count, and gives it at once.
 */
export type Hands = 'novice' | 'skilled';
export type Style = 'fishing' | 'caring';
export interface FamilyPlay {
  hands: Hands;
  style: Style;
  /** Real seconds from one cast to the next, the run included. */
  castSeconds: number;
  /** Game minutes per real second: the city clock's speed. */
  speed: number;
  stray: CatBreed;
  /** The play ends once a cat of this generation is born. */
  generation: number;
}
export interface FamilyPace {
  /** Real seconds into the game at the first birth of each generation. */
  born: Record<number, number>;
  casts: number;
  pets: number;
  gifts: number;
  chats: number;
  invites: number;
  /** The city ran out of room before the generation was born: it never will be. */
  stuck: boolean;
  /** The world as the play ended. */
  world: WorldState;
}

/** Of a cast, the seconds the cat spends on the rod. */
const RUN_SECONDS = 15;
const PET_SECONDS = PETTING.roundTicks / PETTING.ticksPerSecond;
const CHAT_SECONDS = 5;
const GIFT_SECONDS = 3;
const CITY_SECONDS = 5;
/** How long the player looks away while waiting in the city. */
const WAIT_SECONDS = 10;
/** What only time mends: growing up, resting, and a petting allowance spent. */
const WAITS: readonly BreedBlock[] = ['KITTEN', 'COOLING_DOWN', 'NOT_HAPPY'];
/** A play that has not got there in this many real hours is a stuck strategy. */
const REAL_HOURS_LIMIT = 40;
const TRUST = BOND_LEVELS[BREED_BOND_LEVEL].bond;
/** Strong enough for every aimed fish; too strong for bread to hook supplies. */
const POWER = 60;

type Aim = {
  spotId: SpotId;
  baitId: BaitId;
  direction: number;
  power?: number;
};
const POND: Aim = { spotId: 'POND', baitId: 'BREAD', direction: 30 };
/** Newest water first (tests/simulation/pacing.test.ts). */
const AIMS: Record<Hands, Aim[]> = {
  novice: [
    { spotId: 'MOON', baitId: 'WORM', direction: 30 },
    { spotId: 'COAST', baitId: 'BREAD', direction: 30 },
    { spotId: 'REEDS', baitId: 'WORM', direction: 30 },
    POND,
  ],
  skilled: [
    { spotId: 'MOON', baitId: 'WORM', direction: -30 },
    { spotId: 'COAST', baitId: 'SHRIMP', direction: 30 },
    { spotId: 'REEDS', baitId: 'SHRIMP', direction: 30 },
    POND,
  ],
};
/** The skilled player's aim at the moon lake: the best fish a cat of each breed lands. */
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
/** Grass south of the city, off the plan's plots and roads: where the idle cats wait. */
const MEADOW: Position[] = [7, 8, 9]
  .flatMap((y) => [2, 3, 4, 5, 6, 7].map((x) => ({ x, y })))
  .filter(
    (tile) =>
      ![...CITY_PLAN.plots, ...CITY_PLAN.roads].some(
        (plot) => plot.x === tile.x && plot.y === tile.y,
      ),
  );
/** Bread brings these wherever they live. */
const BREAD_FISH: readonly FishId[] = ['SILVER', 'CRUCIAN'];

/** The best petting there is (tests/simulation/pacing.test.ts). */
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

type Goal =
  | { kind: 'done' }
  /** No room in the city for the kittens still needed (MAX_COMPANIONS). */
  | { kind: 'stuck' }
  | { kind: 'invite'; definitionId: (typeof INVITABLE_CATS)[number] }
  | { kind: 'pair'; mother: CatEntity; father: CatEntity; sex: Sex };
type Sex = CatEntity['sex'];
const other = (sex: Sex): Sex => (sex === 'F' ? 'M' : 'F');

const deficit = (cat: CatEntity) => Math.max(0, TRUST - cat.playerBond);

/** What the player works toward next. */
/**
 * How many partners a kitten of these parents and this sex could have: the cats of the
 * other sex in the city who would not be its family (neither its parents nor theirs, nor
 * their other kittens), and the first-generation cats of that sex still to invite.
 */
function partners(
  state: WorldState,
  { mother, father }: { mother: CatEntity; father: CatEntity },
  sex: Sex,
): number {
  const family = (cat: CatEntity) =>
    cat.id === mother.id ||
    cat.id === father.id ||
    related(state, cat, mother) ||
    related(state, cat, father) ||
    cat.parents?.mother === mother.id ||
    cat.parents?.father === father.id;
  const here = state.cats.filter(
    (cat) => cat.sex !== sex && !cat.neutered && !family(cat),
  ).length;
  const coming = INVITABLE_CATS.filter(
    (id) =>
      CAT_DEFINITIONS[id].sex !== sex &&
      !state.cats.some((cat) => cat.definitionId === id),
  ).length;
  return here + coming;
}

function nextGoal(state: WorldState, generation: number): Goal {
  const top = Math.max(...state.cats.map((cat) => cat.generation));
  if (top >= generation) return { kind: 'done' };
  if (state.cats.length >= MAX_COMPANIONS) return { kind: 'stuck' };
  const usable = state.cats.filter((cat) => !cat.neutered);
  const pairs = usable.flatMap((mother) =>
    usable
      .filter(
        (father) =>
          mother.sex === 'F' &&
          father.sex === 'M' &&
          !related(state, mother, father),
      )
      .map((father) => ({ mother, father })),
  );
  const closest = (options: { mother: CatEntity; father: CatEntity }[]) =>
    options.sort(
      (a, b) =>
        deficit(a.mother) +
        deficit(a.father) -
        deficit(b.mother) -
        deficit(b.father),
    )[0];
  const heads = usable.filter((cat) => cat.generation === top);
  /** A new cat of the line: the sex that leaves it more partners. */
  const ahead = (pair: { mother: CatEntity; father: CatEntity }): Goal => ({
    kind: 'pair',
    ...pair,
    sex: partners(state, pair, 'M') > partners(state, pair, 'F') ? 'M' : 'F',
  });
  const next = closest(
    pairs.filter((pair) =>
      [pair.mother, pair.father].some((cat) => cat.generation === top),
    ),
  );
  if (next) return ahead(next);
  const room = state.cats.length < MAX_COMPANIONS;
  const waiting = INVITABLE_CATS.filter(
    (id) => !state.cats.some((cat) => cat.definitionId === id),
  );
  const partner = waiting.find((id) =>
    heads.some((head) => CAT_DEFINITIONS[id].sex !== head.sex),
  );
  if (partner && room) return { kind: 'invite', definitionId: partner };
  // Another kitten: one more of the newest generation, or one who is no family of a
  // cat of it (an aunt or an uncle, say), to be its partner.
  const kin = (cat: CatEntity) => [
    cat.id,
    cat.parents?.mother,
    cat.parents?.father,
  ];
  const served = (pair: { mother: CatEntity; father: CatEntity }) =>
    heads.find(
      (head) =>
        !kin(head).includes(pair.mother.id) &&
        !kin(head).includes(pair.father.id),
    );
  const another = closest(
    pairs.filter(
      (pair) =>
        Math.max(pair.mother.generation, pair.father.generation) === top - 1 ||
        served(pair),
    ),
  );
  if (another && room) {
    // A partner is of the other sex from the cat it is for; another of the line is one
    // more cat of the newest generation.
    const head = served(another);
    return head
      ? { kind: 'pair', ...another, sex: other(head.sex) }
      : ahead(another);
  }
  if (waiting[0] && room) return { kind: 'invite', definitionId: waiting[0] };
  return { kind: 'stuck' };
}

export function playFamily(play: FamilyPlay): FamilyPace {
  const state = createWorld(42, {
    breed: play.stray,
    appearance: CAT_DEFINITIONS.MOCHI.appearance,
  }).getSnapshot();
  const run = (command: GameCommand) =>
    applyCommand(state, commandSchema.parse(command));
  /** A rod input like the one before it, already checked. */
  const tick = (command: GameCommand) => applyCommand(state, command);
  /**
   * A command that may be refused, tried on a copy and kept only when accepted and when
   * `keep` agrees with what it made.
   */
  const attempt = (
    commands: GameCommand[],
    keep: (next: WorldState) => boolean = () => true,
  ) => {
    const next = structuredClone(state);
    try {
      for (const command of commands)
        applyCommand(next, commandSchema.parse(command));
    } catch {
      return false;
    }
    if (!keep(next)) return false;
    Object.assign(state, next);
    return true;
  };
  /** No building shuts a cat in: every cat can still walk to the pond. */
  const open = (next: WorldState) =>
    next.cats.every(
      (one) =>
        atFishingShore(next, one, 'POND') ||
        shoreTiles(next.map, 'POND').some(
          (shore) => findWalkingPath(next, one.id, shore) !== null,
        ),
    );
  const cat = (id: string) => state.cats.find((item) => item.id === id)!;
  const pace: FamilyPace = {
    born: { 1: 0 },
    casts: 0,
    pets: 0,
    gifts: 0,
    chats: 0,
    invites: 0,
    stuck: false,
    world: state,
  };
  let real = 0;
  /** Real seconds go by: at 1× by the river and while petting, at `speed` in the city. */
  const pass = (seconds: number, speed = 1) => {
    real += seconds;
    run({ type: 'ADVANCE_TIME', minutes: seconds * speed });
  };
  const hand = new RandomService(104729);
  const { delay, jitter } = PLAYERS[play.hands];
  const wobble = () => hand.nextInt(2 * jitter + 1) - jitter;
  const caring = play.style === 'caring';
  /** Coins are what the goal waits for: every fish is sold, none given away. */
  let saving = false;

  const pet = (petted: CatEntity) => {
    const { favourite } = pettingTastes(state.seed, petted.id);
    run({ type: 'PET_CAT', catId: petted.id, strokes: PERFECT(favourite) });
    pace.pets++;
    pass(PET_SECONDS);
  };
  const counts = (used: CatEntity['giftBond'], limit: number): boolean =>
    spendDaily(used, state.minute, limit) !== null;

  /** Both happy at once, petting the less happy one while it may still be lifted. */
  const makeHappy = (pair: CatEntity[]) => {
    const lifts = (one: CatEntity) => pettingLiftsLeft(one, state.minute);
    // The one with more lifts left first: while the other is not happy yet it takes all
    // of them, to stay happy while the other is petted; then the other up to happy.
    const [first, second] = [...pair].sort((a, b) => lifts(b) - lifts(a));
    while (
      lifts(first!) > 0 &&
      (first!.mood < MOOD.happy || second!.mood < MOOD.happy)
    )
      pet(first!);
    while (lifts(second!) > 0 && second!.mood < MOOD.happy) pet(second!);
  };

  /**
   * A bed for one more cat: an apartment on the next plot of the city plan
   * (tests/helpers/city-player.ts) that shuts no cat in, with its land and the planned road
   * beside it when it needs them; none while the coins do not reach.
   */
  const ensureBed = () => {
    if (freeBeds(state).length) return true;
    const built = state.buildings.filter(
      (building) => building.type === 'CAT_APARTMENT',
    ).length;
    if (state.coins < buildingPrice('CAT_APARTMENT', built)) return false;
    const owned = (position: Position) =>
      state.map.tiles.find(
        (tile) =>
          tile.position.x === position.x && tile.position.y === position.y,
      )!.owned;
    const land = (position: Position): GameCommand[] =>
      owned(position) ? [] : [{ type: 'BUY_LAND', position }];
    for (const plot of CITY_PLAN.plots) {
      const build: GameCommand = {
        type: 'BUILD_BUILDING',
        buildingType: 'CAT_APARTMENT',
        position: plot,
      };
      // The planned road beside it, when it needs one to reach the network.
      const road = CITY_PLAN.roads.find(
        (item) => Math.abs(item.x - plot.x) + Math.abs(item.y - plot.y) === 1,
      );
      if (
        attempt([...land(plot), build], open) ||
        (road &&
          attempt(
            [
              ...land(plot),
              ...land(road),
              { type: 'PLACE_ROAD', position: road },
              build,
            ],
            open,
          ))
      ) {
        pass(CITY_SECONDS, play.speed);
        return true;
      }
    }
    return false;
  };

  /** Cats beside no one's way: every idle cat but those named walks to the south meadow. */
  const park = (keep: readonly string[]) => {
    const taken = (position: Position) =>
      state.cats.some(
        (one) => one.position.x === position.x && one.position.y === position.y,
      ) ||
      state.cats.some(
        (one) =>
          one.walk?.destination.x === position.x &&
          one.walk.destination.y === position.y,
      );
    for (const one of state.cats) {
      if (keep.includes(one.id) || one.walk) continue;
      if (
        MEADOW.some(
          (tile) => tile.x === one.position.x && tile.y === one.position.y,
        )
      )
        continue;
      const free = MEADOW.find((tile) => !taken(tile));
      if (free)
        attempt([{ type: 'WALK_CAT', catId: one.id, destination: free }]);
    }
  };

  /** The water and bait for a cast with `fisher`; bread for a favourite gift when caring. */
  const aimFor = (fisher: CatEntity, gifted: readonly CatEntity[]): Aim => {
    const water = AIMS[play.hands]
      .map((aim) =>
        play.hands === 'skilled' && aim.spotId === 'MOON'
          ? MOON_BEST[fisher.breedId]
          : aim,
      )
      .find((aim) => spotOpen(aim.spotId, state.fishing))!;
    const wanted =
      caring &&
      !saving &&
      gifted.some(
        (one) =>
          counts(one.giftBond, BOND.giftsPerDay) &&
          one.favoriteFish.some(
            (id) =>
              BREAD_FISH.includes(id) && SPOTS[water.spotId].fish.includes(id),
          ),
      );
    const aim = wanted ? { ...POND, spotId: water.spotId } : water;
    if (aim.baitId !== 'BREAD' && state.fishing.baits[aim.baitId] === 0) {
      if (state.coins < BAITS[aim.baitId].price) return POND;
      run({ type: 'BUY_BAIT', baitId: aim.baitId });
    }
    return aim;
  };

  /** One cast with `fisher`, after walking it to the water if need be. */
  const cast = (fisher: CatEntity, gifted: readonly CatEntity[]) => {
    const aim = aimFor(fisher, gifted);
    if (!atFishingShore(state, fisher, aim.spotId)) {
      if (!fisher.walk)
        try {
          run({
            type: 'TRAVEL_TO_FISHING_SPOT',
            catId: fisher.id,
            spotId: aim.spotId,
          });
        } catch {
          // Other cats stand in its way: they make room.
          park(gifted.map((one) => one.id));
        }
      pass(5, play.speed);
      return;
    }
    if (state.fishing.inventory.length === FISHING.bag.capacity)
      for (const item of [...state.fishing.inventory])
        run({ type: 'SELL_FISH', fishId: item.id });
    // The pond fish keep to their sides: one to the left, one to the right.
    const direction =
      aim.baitId === 'BREAD' && pace.casts % 2 === 0
        ? -aim.direction
        : aim.direction;
    run({
      type: 'FISH_BEGIN',
      catId: fisher.id,
      spotId: aim.spotId,
      baitId: aim.baitId,
      direction,
      aimDepth: 50,
      mode: 'motion',
    });
    const runId = state.fishing.active!.id;
    pace.casts++;
    run({ type: 'FISH_CAST', runId, power: aim.power ?? POWER });
    // On the rod the cat recovers nothing while the city clock runs.
    pass(RUN_SECONDS);
    const still = { type: 'FISH_MOTION_CONTROL', runId, x: 50, y: 50 } as const;
    const bite = motionSchedule(state.fishing.active!).bite;
    run({ ...still, ticks: 1 });
    while (state.fishing.active?.phase === 'waiting')
      tick({
        ...still,
        ticks: Math.min(
          FISHING.input.maxTicks,
          bite - state.fishing.active.phaseTick,
        ),
      });
    const lift = Math.max(1, delay + wobble());
    for (let late = 0; late < lift && state.fishing.active; late++)
      tick({ ...still, ticks: 1 });
    if (state.fishing.active) run({ type: 'FISH_STRIKE', runId });
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
        ...rodTip(play.hands, state.fishing.active, path, wobble),
        ticks: 1,
      });
    pass(play.castSeconds - RUN_SECONDS);
    if (!state.fishing.lastResult!.caught) return;
    const caught = state.fishing.inventory.at(-1);
    if (!caught) return;
    const fan =
      caring && !saving
        ? gifted.find(
            (one) =>
              one.favoriteFish.includes(caught.speciesId) &&
              counts(one.giftBond, BOND.giftsPerDay),
          )
        : undefined;
    if (fan) {
      run({ type: 'GIFT_FISH', fishId: caught.id, catId: fan.id });
      pace.gifts++;
      pass(GIFT_SECONDS);
    } else run({ type: 'SELL_FISH', fishId: caught.id });
  };

  /** Every free way to the bond and a happy cat on the rod, for the caring player. */
  const care = (pair: readonly CatEntity[], fisher: CatEntity) => {
    for (const one of pair) {
      if (counts(one.chatBond, BOND.chatsPerDay)) {
        run({
          type: 'INTERACT',
          catId: one.id,
          message: '你好',
          reply: '喵',
        });
        pace.chats++;
        pass(CHAT_SECONDS, play.speed);
      }
      // Once a cat has its bond, its lifts wait for the kitten (makeHappy).
      const liftable = pettingLiftsLeft(one, state.minute) > 0;
      if (
        deficit(one) > 0 &&
        (counts(one.pettingBond, BOND.pettingPerDay) ||
          (one === fisher && one.mood < MOOD.happy && liftable))
      )
        pet(one);
    }
  };

  /** Work with the pair: bond for the one who needs more, coins either way. */
  const work = (ids: readonly string[]) => {
    const pair = ids.map(cat);
    const rested = (one: CatEntity) =>
      one.needs.energy >= castCost(one.talent.stamina) &&
      state.fishing.active === null;
    const fisher =
      pair.filter(rested).sort((a, b) => deficit(b) - deficit(a))[0] ??
      state.cats.find(rested);
    if (caring) care(pair, fisher ?? pair[0]!);
    if (fisher) cast(cat(fisher.id), ids.map(cat));
    else pass(WAIT_SECONDS, play.speed);
  };

  for (;;) {
    if (real > REAL_HOURS_LIMIT * 3600)
      throw new Error(
        `No generation ${play.generation} in ${REAL_HOURS_LIMIT} hours: ${JSON.stringify(
          state.cats.map((one) => [
            one.id,
            one.generation,
            one.sex,
            one.parents,
            one.lastBredMinute,
            one.playerBond,
            one.mood,
            one.needs.energy,
            one.fishingSpotId,
            !!one.walk,
          ]),
        )} coins ${state.coins}`,
      );
    const goal = nextGoal(state, play.generation);
    if (goal.kind === 'done') break;
    if (goal.kind === 'stuck') {
      pace.stuck = true;
      break;
    }
    if (goal.kind === 'invite') {
      const invite = {
        type: 'INVITE_CAT',
        definitionId: goal.definitionId,
      } as const;
      saving = !(
        ensureBed() &&
        state.coins >= nextInvitePrice(state) &&
        attempt([invite])
      );
      if (saving) work([state.cats[0]!.id]);
      else {
        pace.invites++;
        pass(CITY_SECONDS, play.speed);
      }
      continue;
    }
    const ids = [goal.mother.id, goal.father.id] as const;
    const blocks = breedBlocks(state, ...ids);
    if (!blocks.length) {
      run({
        type: 'BREED_CATS',
        motherId: ids[0],
        fatherId: ids[1],
        name: '团子',
        sex: goal.sex,
      });
      const kitten = state.cats.at(-1)!;
      pace.born[kitten.generation] ??= real;
      pass(CITY_SECONDS, play.speed);
      continue;
    }
    saving = blocks.includes('NO_BED') && !ensureBed();
    if (saving) {
      work(ids);
      continue;
    }
    if (blocks.every((block) => block === 'NOT_HAPPY')) makeHappy(ids.map(cat));
    const left = breedBlocks(state, ...ids);
    // With the bond earned, only time is missing: the player waits in the city.
    if (
      left.length &&
      ids.every((id) => deficit(cat(id)) === 0) &&
      left.every((block) => WAITS.includes(block))
    )
      pass(WAIT_SECONDS, play.speed);
    else if (left.length) work(ids);
  }
  // Every shortcut above still left a world that Core accepts.
  new World(state);
  return pace;
}
