import { CAT_DEFINITIONS } from '../../content/cats';
import type { CatMakerInput } from './cat-maker-screen';

/** Words of a new game's start: a stray by the road (spec 041 cat-looks.md 2). */
export const STRAY_COPY = {
  title: '路边捡到一只流浪猫',
  line: '它缩在路边，看着你。',
  look: '抱起它',
  confirm: '就是它了',
  home: (name: string) => `你把它抱回了小城。它叫 ${name}。`,
} as const;

/** The maker as the stray opens it: the one time a breed is picked; a domestic cat first. */
export const STRAY_MAKER: CatMakerInput = {
  pickBreed: true,
  confirm: STRAY_COPY.confirm,
  breed: 'DOMESTIC',
  appearance: CAT_DEFINITIONS.MOCHI.appearance,
};
