import { BOND } from '../content/care';
import { CAFE } from '../content/city';
import { grownFrom } from '../content/family';
import {
  canCatchFish,
  FISH_IDS,
  SPOT_IDS,
  SPOTS,
  spotOpen,
} from '../content/fishing';
import { WISH, WISH_KINDS, type WishKind } from '../content/wishes';
import { gameDay, rewardBond } from './bond';
import { gridDistance } from './city/map';
import type { GameEvent } from './commands';
import { liftCalmMood, liftMood } from './mood';
import { idNumber, RandomService, runSeed, streamSeed } from './random';
import type { CatEntity, WorldState } from './schema';

// Wishes (spec 041 R-50 – R-53, design 7). The schema imports this module, so it keeps
// clear of the command modules (cats.ts, commands.ts) that import the schema.

/** Whether a cafe stands within a cafe's range of the cat's home. */
function cafeNearHome(world: WorldState, cat: CatEntity): boolean {
  const home = world.buildings.find((building) => building.id === cat.home);
  return (
    !!home &&
    world.buildings.some(
      (building) =>
        building.type === 'CAT_CAFE' &&
        gridDistance(building.position, home.position) <= CAFE.range,
    )
  );
}

/**
 * Every wish the cat could think of now, kind by kind: only what the player can do now
 * (R-50). A fish of open water that the cat's breed can catch; a home while it has none;
 * a cafe near its home while none is; petting; an outing to open water.
 */
export function wishTargets(
  world: WorldState,
  cat: CatEntity,
): Record<WishKind, readonly (string | null)[]> {
  const open = SPOT_IDS.filter((spot) => spotOpen(spot, world.fishing));
  return {
    FISH: FISH_IDS.filter(
      (fish) =>
        canCatchFish(fish, cat.breedId) &&
        open.some((spot) => SPOTS[spot].fish.includes(fish)),
    ),
    HOME: cat.home === null ? [null] : [],
    CAFE: cat.home !== null && !cafeNearHome(world, cat) ? [null] : [],
    PETTING: [null],
    OUTING: open,
  };
}

/** Whether the cat has left its wish alone so long that it changes its mind today. */
const changesMind = (cat: CatEntity, day: number) =>
  !!cat.wish && day - cat.wish.sinceDay >= WISH.changeMindDays;

/**
 * As a game day starts, each grown companion without a wish, and none granted that day,
 * may think of one (R-50); one that has left its wish alone for `changeMindDays` thinks
 * of another in its place, at no cost (R-52, user 2026-09-30). The seed, the cat and the
 * day decide whether, then the kind among those it could wish for now (another kind
 * than before, while there is one), then the target.
 */
export function wishesArise(world: WorldState): void {
  if (world.minute % BOND.dayMinutes) return;
  const day = gameDay(world.minute);
  for (const cat of world.cats) {
    const changing = changesMind(cat, day);
    if (
      (cat.wish && !changing) ||
      (cat.lastWishDay !== null && cat.lastWishDay >= day) ||
      world.minute < grownFrom(cat.bornMinute)
    )
      continue;
    const random = new RandomService(
      runSeed((streamSeed(world.seed, 'wish') ^ idNumber(cat.id)) >>> 0, day),
    );
    if (!changing && random.nextInt(100) >= WISH.chancePercent) continue;
    const targets = wishTargets(world, cat);
    const kinds = WISH_KINDS.filter((kind) => targets[kind].length);
    const others = kinds.filter((kind) => kind !== cat.wish?.kind);
    const pool = others.length ? others : kinds;
    const kind = pool[random.nextInt(pool.length)]!;
    const target = targets[kind][random.nextInt(targets[kind].length)] ?? null;
    cat.wish = { kind, target, sinceDay: day };
  }
}

/**
 * Grants the cat's wish if it is for this deed (R-53): the wish goes, the day is kept,
 * and the cat takes the bond points and the mood. An outing is granted by a catch, which
 * lifts mood only to just under happy, as every catch (C3).
 */
export function grantWish(
  world: WorldState,
  cat: CatEntity,
  kind: WishKind,
  target: string | null,
  events: GameEvent[],
): void {
  if (cat.wish?.kind !== kind || cat.wish.target !== target) return;
  cat.wish = null;
  cat.lastWishDay = gameDay(world.minute);
  rewardBond(cat, WISH.bond);
  (kind === 'OUTING' ? liftCalmMood : liftMood)(cat, WISH.mood);
  events.push({
    type: 'WishFulfilled',
    minute: world.minute,
    entityId: cat.id,
    kind,
    target,
  });
}

/** After a city command: every wish for a home, or a cafe near home, the city now meets. */
export function grantCityWishes(world: WorldState, events: GameEvent[]): void {
  for (const cat of world.cats) {
    if (cat.home !== null) grantWish(world, cat, 'HOME', null, events);
    if (cafeNearHome(world, cat)) grantWish(world, cat, 'CAFE', null, events);
  }
}

/**
 * Only wishes that could have come: thought of on a day that has started, by a grown cat,
 * after the last one granted, not so long ago that the cat would have changed its mind,
 * and still one the cat could think of now. What it wishes for only opens up (waters) or
 * is granted at once when met (a home, a cafe near it).
 */
export function assertWishes(world: WorldState): void {
  const today = gameDay(world.minute);
  for (const cat of world.cats) {
    const { wish, lastWishDay } = cat;
    if (
      (lastWishDay !== null && lastWishDay > today) ||
      (wish &&
        (wish.sinceDay > today ||
          changesMind(cat, today) ||
          (lastWishDay !== null && wish.sinceDay <= lastWishDay) ||
          wish.sinceDay * BOND.dayMinutes < grownFrom(cat.bornMinute) ||
          !wishTargets(world, cat)[wish.kind].includes(wish.target)))
    )
      throw new Error('Invalid wish');
  }
}
