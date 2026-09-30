import { BOND_LEVELS } from '../../src/content/care';
import { BREED_BOND_LEVEL } from '../../src/content/family';
import { MOOD } from '../../src/content/mood';
import { createWorld, World } from '../../src/core';
import { instantiateCat } from '../../src/core/cats';

/** A plot of seed 42's starter district beside a road. */
const APARTMENT = { x: 4, y: 3 };
/** Grass away from the city. */
const PEPPER_STANDS = { x: 2, y: 7 };

/**
 * Mochi and Pepper, both happy and trusting the player, and an empty apartment: every
 * condition to have a kitten holds (spec 041 R-31). A valid save of seed 42.
 */
export function readyPair(): World {
  const world = createWorld(42);
  const built = world.dispatch({
    type: 'BUILD_BUILDING',
    buildingType: 'CAT_APARTMENT',
    position: APARTMENT,
  });
  if (!built.ok) throw new Error(built.error);
  const state = world.getSnapshot();
  state.cats.push(
    instantiateCat('PEPPER', `cat-${state.nextId++}`, PEPPER_STANDS),
  );
  for (const cat of state.cats) {
    cat.mood = MOOD.happy;
    cat.playerBond = BOND_LEVELS[BREED_BOND_LEVEL].bond;
  }
  return new World(state);
}
