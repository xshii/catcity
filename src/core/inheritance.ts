import { bondLevel } from '../content/care';
import { APPEARANCE_OPTIONS, type CatAppearance } from '../content/cats';
import {
  grownFrom,
  HERITAGE_BOND_LEVELS,
  MAX_TALENT,
  TALENT_NAMES,
  type Talent,
} from '../content/family';
import { RandomService, runSeed, streamSeed } from './random';
import type { CatEntity, WorldState } from './schema';

/**
 * What a kitten takes from its parents (R-33, R-35); everything else is its own, its sex
 * the player's choice (user 2026-09-30).
 */
export interface Inheritance {
  breedId: CatEntity['breedId'];
  appearance: CatAppearance;
  personality: string[];
  traits: string[];
  likes: string[];
  dislikes: string[];
  favoriteFish: CatEntity['favoriteFish'];
  talent: Talent;
}

/** A born cat's id serial: `cat-N` is N. */
const catSerial = (id: string): number | null => {
  const match = /^cat-(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
};

/**
 * The family marks (家传, design 5.4) a cat has earned in its life: one for each of
 * `HERITAGE_BOND_LEVELS` its bond has reached. The bond never falls, so neither do they.
 */
export const familyMarks = (cat: Pick<CatEntity, 'playerBond'>): number =>
  HERITAGE_BOND_LEVELS.filter((level) => bondLevel(cat.playerBond) >= level)
    .length;

const LOOK_ITEMS = Object.keys(APPEARANCE_OPTIONS) as (keyof CatAppearance)[];

/**
 * A kitten's inheritance (R-33, design 5.3 – 5.4), drawn from `streamSeed(seed,
 * 'inherit')` and its id serial alone, in a fixed order, so the save can draw it again:
 * the breed and each of the five looks from one parent; one personality word,
 * trait, like, dislike and favourite fish from each (one, when both give the same); each
 * talent from one parent; then one talent raised per family mark `passed` down, each at
 * most once, none past `MAX_TALENT`.
 */
export function inherit(
  seed: number,
  kittenId: string,
  mother: CatEntity,
  father: CatEntity,
  passed: number,
): Inheritance {
  const random = new RandomService(
    runSeed(streamSeed(seed, 'inherit'), catSerial(kittenId) ?? 0),
  );
  // The first draws of neighbouring seeds lie close together.
  for (let warm = 0; warm < 4; warm++) random.nextInt(2);
  const either = <T>(fromMother: T, fromFather: T): T =>
    random.nextInt(2) ? fromFather : fromMother;
  const oneOfEach = <T>(fromMother: readonly T[], fromFather: readonly T[]) => {
    const mine = fromMother[random.nextInt(fromMother.length)]!;
    const theirs = fromFather[random.nextInt(fromFather.length)]!;
    return mine === theirs ? [mine] : [mine, theirs];
  };
  const breedId = either(mother.breedId, father.breedId);
  const appearance = Object.fromEntries(
    LOOK_ITEMS.map((item) => [
      item,
      either(mother.appearance[item], father.appearance[item]),
    ]),
  ) as CatAppearance;
  const personality = oneOfEach(mother.personality, father.personality);
  const traits = oneOfEach(mother.traits, father.traits);
  const likes = oneOfEach(mother.preferences.likes, father.preferences.likes);
  const dislikes = oneOfEach(
    mother.preferences.dislikes,
    father.preferences.dislikes,
  );
  const favoriteFish = oneOfEach(mother.favoriteFish, father.favoriteFish);
  const talent = Object.fromEntries(
    TALENT_NAMES.map((name) => [
      name,
      either(mother.talent[name], father.talent[name]),
    ]),
  ) as Talent;
  // The marks raise talents in an order the seed shuffles.
  const order = [...TALENT_NAMES];
  for (let last = order.length - 1; last > 0; last--) {
    const pick = random.nextInt(last + 1);
    [order[last], order[pick]] = [order[pick]!, order[last]!];
  }
  for (const name of order.slice(0, passed))
    talent[name] = Math.min(MAX_TALENT, talent[name] + 1);
  return {
    breedId,
    appearance,
    personality,
    traits,
    likes,
    dislikes,
    favoriteFish,
    talent,
  };
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);

/**
 * A born cat must be its parents' kitten (R-11): the parents in the city, a queen and a
 * tom, grown when it was born; one generation after the elder line; and every inherited
 * trait drawn again from the seed, its id and the marks it was born with. Those marks
 * are the family's at its birth, so they may be fewer than the parents hold now, never
 * more. Its look is not compared: the salon may have restyled it or its parents (T-15).
 */
export function assertBorn(world: WorldState, cat: CatEntity): void {
  const parent = (id: string | undefined) =>
    world.cats.find((other) => other.id === id);
  const mother = parent(cat.parents?.mother);
  const father = parent(cat.parents?.father);
  const born = cat.bornMinute;
  if (
    catSerial(cat.id) === null ||
    !mother ||
    !father ||
    mother.sex !== 'F' ||
    father.sex !== 'M' ||
    born === null ||
    born > world.minute ||
    [mother, father].some((grown) => born < grownFrom(grown.bornMinute)) ||
    cat.generation !== Math.max(mother.generation, father.generation) + 1
  )
    throw new Error('Born cat without its parents');
  const passed = cat.heritage - mother.heritage - father.heritage;
  if (passed < 0 || passed > familyMarks(mother) + familyMarks(father))
    throw new Error('Born cat with marks its family never earned');
  const expected = inherit(world.seed, cat.id, mother, father, passed);
  if (
    cat.breedId !== expected.breedId ||
    !sameList(cat.personality, expected.personality) ||
    !sameList(cat.traits, expected.traits) ||
    !sameList(cat.preferences.likes, expected.likes) ||
    !sameList(cat.preferences.dislikes, expected.dislikes) ||
    !sameList(cat.favoriteFish, expected.favoriteFish) ||
    TALENT_NAMES.some((name) => cat.talent[name] !== expected.talent[name])
  )
    throw new Error('Born cat does not match its inheritance');
}
