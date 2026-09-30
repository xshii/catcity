import { RESTYLE_PRICE } from '../../content/city';
import type { CatEntity } from '../../core';
import type { CatMakerInput } from './cat-maker-screen';

/** Words of the cat salon (spec 041 cat-looks.md 3). */
export const SALON_COPY = {
  confirm: `改造 · ${RESTYLE_PRICE} 金币`,
  done: (name: string) =>
    `${name} 换了新样子，改造花了 ${RESTYLE_PRICE} 金币。`,
} as const;

/** The maker as the salon opens it: the cat as it looks now; the breed stays its own. */
export const salonMaker = (cat: CatEntity): CatMakerInput => ({
  pickBreed: false,
  confirm: SALON_COPY.confirm,
  breed: cat.breedId,
  appearance: cat.appearance,
});
