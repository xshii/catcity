import {
  PET_SPOT_NAMES,
  type PetSpot,
  type PetTaste,
} from '../../content/petting';
import type { PetTastes } from '../../minigames/petting';

/** A cat's petting tastes in words (spec 039): on the petting screen and in the cat's detail. */
export const TASTE_COPY = {
  tastes: {
    favourite: { mark: '♥', label: '最喜欢' },
    neutral: { mark: '○', label: '还行' },
    disliked: { mark: '✕', label: '不喜欢' },
  } satisfies Record<PetTaste, { mark: string; label: string }>,
  unknown: '还不知道',
} as const;

/** The spots of a cat the player knows, as words: '最喜欢 下巴 · 不喜欢 肚子'. */
export function knownTastes(tastes: PetTastes, discovered: readonly PetSpot[]) {
  return (['favourite', 'disliked'] as const)
    .filter((taste) => discovered.includes(tastes[taste]))
    .map(
      (taste) =>
        `${TASTE_COPY.tastes[taste].label} ${PET_SPOT_NAMES[tastes[taste]]}`,
    )
    .join(' · ');
}
