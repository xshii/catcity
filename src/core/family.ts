import { bondLevel } from '../content/care';
import { MAX_COMPANIONS } from '../content/cats';
import { BUILDINGS } from '../content/city';
import { BREED_BOND_LEVEL, BREED_COOLDOWN_MINUTES } from '../content/family';
import { MOOD } from '../content/mood';
import { catStage, requireCat } from './cats';
import type { CatEntity, WorldState } from './schema';

/**
 * Why two cats cannot have a kitten now (spec 041 R-31, design 5.1), in the order a
 * rejected command reports the first of them.
 */
const BREED_BLOCKS = [
  'SAME_CAT',
  'NEED_PAIR',
  'KITTEN',
  'NEUTERED',
  'NOT_HAPPY',
  'BOND_TOO_LOW',
  'RELATED',
  'COOLING_DOWN',
  'NO_BED',
  'COMPANION_LIMIT',
] as const;
export type BreedBlock = (typeof BREED_BLOCKS)[number];

const failing = (checks: [BreedBlock, boolean][]): BreedBlock[] =>
  checks.filter(([, fails]) => fails).map(([block]) => block);

/** Every cat the cat descends from: its parents, theirs, and so on up. */
function ancestors(world: WorldState, cat: CatEntity): Set<string> {
  const found = new Set<string>();
  const next = [cat];
  while (next.length) {
    const { parents } = next.pop()!;
    if (!parents) continue;
    for (const id of [parents.mother, parents.father]) {
      found.add(id);
      const parent = world.cats.find((cat) => cat.id === id);
      if (parent) next.push(parent);
    }
  }
  return found;
}

/**
 * The direct line, however far up (user 2026-09-30), or two cats with the same mother or
 * the same father. An aunt and her niece, or cousins, are not related.
 */
export function related(
  world: WorldState,
  a: CatEntity,
  b: CatEntity,
): boolean {
  return (
    ancestors(world, a).has(b.id) ||
    ancestors(world, b).has(a.id) ||
    (!!a.parents &&
      !!b.parents &&
      (a.parents.mother === b.parents.mother ||
        a.parents.father === b.parents.father))
  );
}

/** What keeps the two from being a pair, whatever state each is in. */
export function pairBreedBlocks(
  world: WorldState,
  a: CatEntity,
  b: CatEntity,
): BreedBlock[] {
  if (a.id === b.id) return ['SAME_CAT'];
  return failing([
    ['NEED_PAIR', a.sex === b.sex],
    ['RELATED', related(world, a, b)],
  ]);
}

/** What keeps this cat itself from having a kitten now, whoever the other one is. */
export function catBreedBlocks(
  world: WorldState,
  cat: CatEntity,
): BreedBlock[] {
  return failing([
    ['KITTEN', catStage(world, cat) === 'kitten'],
    ['NEUTERED', cat.neutered],
    ['NOT_HAPPY', cat.mood < MOOD.happy],
    ['BOND_TOO_LOW', bondLevel(cat.playerBond) < BREED_BOND_LEVEL],
    [
      'COOLING_DOWN',
      cat.lastBredMinute !== null &&
        world.minute - cat.lastBredMinute < BREED_COOLDOWN_MINUTES,
    ],
  ]);
}

/** What keeps the city from taking one more cat: a free bed, room among the companions. */
export function cityBreedBlocks(world: WorldState): BreedBlock[] {
  const beds = world.buildings.reduce(
    (sum, building) => sum + BUILDINGS[building.type].homeCapacity,
    0,
  );
  return failing([
    ['NO_BED', world.cats.filter((cat) => cat.home !== null).length >= beds],
    ['COMPANION_LIMIT', world.cats.length >= MAX_COMPANIONS],
  ]);
}

/** Every condition the two fail, each once; none means they can have a kitten. */
export function breedBlocks(
  world: WorldState,
  aId: string,
  bId: string,
): BreedBlock[] {
  const a = requireCat(world, aId);
  const b = requireCat(world, bId);
  const found = new Set([
    ...pairBreedBlocks(world, a, b),
    ...catBreedBlocks(world, a),
    ...catBreedBlocks(world, b),
    ...cityBreedBlocks(world),
  ]);
  return BREED_BLOCKS.filter((block) => found.has(block));
}
