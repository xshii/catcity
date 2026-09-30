import { bondLevel } from '../content/care';
import { MAX_COMPANIONS } from '../content/cats';
import {
  BREED_BOND_LEVEL,
  BREED_COOLDOWN_MINUTES,
  NEUTER_PRICE,
} from '../content/family';
import { MOOD } from '../content/mood';
import {
  arrivalTile,
  catStage,
  freeBeds,
  newToTheCity,
  requireCat,
} from './cats';
import { CommandError, type ErrorCode, type GameEvent } from './commands';
import { familyMarks, inherit } from './inheritance';
import type { CatEntity, WorldState } from './schema';

/**
 * A grown cat is neutered once and for good, for a few coins (spec 041 R-30, design 5.2).
 * It has no kittens after (`NEUTERED` among the breed blocks); nothing else changes.
 */
export function neuterCat(world: WorldState, catId: string): GameEvent[] {
  const cat = requireCat(world, catId);
  if (catStage(world, cat) === 'kitten')
    throw new CommandError('CAT_TOO_YOUNG');
  if (cat.neutered) throw new CommandError('ALREADY_NEUTERED');
  if (world.coins < NEUTER_PRICE) throw new CommandError('INSUFFICIENT_COINS');
  world.coins -= NEUTER_PRICE;
  cat.neutered = true;
  return [
    {
      type: 'CatNeutered',
      minute: world.minute,
      entityId: cat.id,
      cost: NEUTER_PRICE,
    },
  ];
}

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
  return failing([
    ['NO_BED', !freeBeds(world).length],
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

/** The error a refused kitten reports: its first unmet condition (design 5.1). */
const BLOCK_ERRORS: Record<BreedBlock, ErrorCode> = {
  SAME_CAT: 'SAME_CAT',
  NEED_PAIR: 'NEED_PAIR',
  KITTEN: 'CAT_TOO_YOUNG',
  NEUTERED: 'CAT_NEUTERED',
  NOT_HAPPY: 'NOT_HAPPY',
  BOND_TOO_LOW: 'BOND_TOO_LOW',
  RELATED: 'RELATED',
  COOLING_DOWN: 'COOLING_DOWN',
  NO_BED: 'NO_BED',
  COMPANION_LIMIT: 'COMPANION_LIMIT',
};

/**
 * A kitten for a pair that meets every condition (spec 041 R-32, design 5.2): the next id,
 * its inheritance, the name the player gave it, the first free bed and the walkable tile
 * nearest it. It carries its line's family marks and those its parents earned; both
 * parents rest from now. Nothing is drawn or allocated for a refused pair.
 */
export function breedCats(
  world: WorldState,
  motherId: string,
  fatherId: string,
  name: string,
): GameEvent[] {
  const blocks = breedBlocks(world, motherId, fatherId);
  const mother = requireCat(world, motherId);
  const father = requireCat(world, fatherId);
  // The command names who is who: the mother is the queen.
  const block =
    blocks[0] === 'SAME_CAT' || (mother.sex === 'F' && father.sex === 'M')
      ? blocks[0]
      : 'NEED_PAIR';
  if (block) throw new CommandError(BLOCK_ERRORS[block]);
  const home = freeBeds(world)[0]!;
  const position = arrivalTile(world, home);
  if (!position) throw new CommandError('INVALID_PLACEMENT');
  const id = `cat-${world.nextId++}`;
  const passed = familyMarks(mother) + familyMarks(father);
  const { likes, dislikes, ...inherited } = inherit(
    world.seed,
    id,
    mother,
    father,
    passed,
  );
  world.cats.push({
    ...newToTheCity(position),
    ...inherited,
    id,
    definitionId: null,
    name,
    preferences: { likes, dislikes },
    bornMinute: world.minute,
    generation: Math.max(mother.generation, father.generation) + 1,
    parents: { mother: mother.id, father: father.id },
    neutered: false,
    heritage: mother.heritage + father.heritage + passed,
    lastBredMinute: null,
    home: home.id,
  });
  mother.lastBredMinute = world.minute;
  father.lastBredMinute = world.minute;
  return [
    {
      type: 'CatBorn',
      minute: world.minute,
      entityId: id,
      motherId: mother.id,
      fatherId: father.id,
    },
  ];
}
