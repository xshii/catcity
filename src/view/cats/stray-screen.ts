import { CAT_DEFINITIONS, STARTER_CAT_ID } from '../../content/cats';
import { nameSalt, suggestNames, type WorldState } from '../../core';
import type { CatMakerInput } from './cat-maker-screen';
import type { NameDialogInput } from './name-dialog-screen';

/** Words of a new game's start: a stray by the road (spec 041 cat-looks.md 2). */
export const STRAY_COPY = {
  title: '路边捡到一只流浪猫',
  line: '它缩在路边，看着你。',
  look: '抱起它',
  confirm: '就是它了',
  home: (name: string) => `你把它抱回了小城。它叫 ${name}。`,
  /** The name box after the maker (T-25). */
  name: '给它起个名字',
  takeHome: '带它回家',
} as const;

/** The maker as the stray opens it: the one time a breed is picked; a domestic cat first. */
export const STRAY_MAKER: CatMakerInput = {
  pickBreed: true,
  confirm: STRAY_COPY.confirm,
  breed: 'DOMESTIC',
  appearance: CAT_DEFINITIONS.MOCHI.appearance,
};

/**
 * The name box after the maker (T-25): the city the stray starts, with no cat in it yet
 * (the template waiting behind the start is nobody's namesake), and the box on its first
 * suggestion, shuffled as Mochi's names always are.
 */
export function strayNaming(world: WorldState): {
  world: WorldState;
  input: NameDialogInput;
} {
  const city = { ...world, cats: [] };
  const salt = nameSalt(STARTER_CAT_ID);
  return {
    world: city,
    input: {
      title: STRAY_COPY.name,
      confirm: STRAY_COPY.takeHome,
      initial: suggestNames(city, salt, 0)[0]!,
      salt,
    },
  };
}
