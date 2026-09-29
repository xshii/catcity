import type { FishId } from '../../content/fishing';

/** Inline SVG illustrations for DOM cards; colors are art, not game data. */
const FISH_COLORS: Record<FishId, string> = {
  SILVER: '#a7cbd4',
  CRUCIAN: '#bcaa86',
  PERCH: '#829e72',
  CATFISH: '#8799af',
  KOI: '#e59777',
  MOON_CARP: '#a497ce',
  MACKEREL: '#6598ae',
  SEA_BREAM: '#d5969e',
};

export function fishIllustration(id: FishId): string {
  const color = FISH_COLORS[id];
  return `<svg viewBox="0 0 180 90" aria-hidden="true"><ellipse cx="92" cy="76" rx="54" ry="5" fill="#456a5c" opacity=".12"/><path d="M52 43L16 18Q24 43 16 68L52 48" fill="${color}"/><path d="M77 28L100 9L119 32M89 58L110 78L122 53" fill="${color}"/><ellipse cx="99" cy="44" rx="53" ry="27" fill="${color}"/><path d="M60 47Q96 76 141 48" fill="#fff" opacity=".3"/><path d="M112 25Q96 44 112 65" stroke="#43584e" opacity=".3" fill="none" stroke-width="3"/><circle cx="131" cy="36" r="4" fill="#334b46"/><circle cx="132" cy="35" r="1.3" fill="#fff"/></svg>`;
}
/** A dark, soft-edged fish shape under the water, facing right; the species stays unknown. */
export function fishShadow(): string {
  return `<svg viewBox="10 5 140 80" aria-hidden="true"><ellipse cx="96" cy="44" rx="58" ry="32" fill="#243b37" opacity=".3"/><path d="M52 43L16 18Q24 43 16 68L52 48" fill="#243b37"/><ellipse cx="99" cy="44" rx="53" ry="27" fill="#243b37"/><circle cx="131" cy="36" r="3.5" fill="#fffdf4" opacity=".5"/></svg>`;
}
export function catPortrait(coat: 'cream' | 'gray'): string {
  const color = coat === 'cream' ? '#efdbb2' : '#bbc3c7';
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 31L10 9l17 12h10L54 9l-2 22" fill="${color}"/><ellipse cx="32" cy="35" rx="23" ry="20" fill="${color}"/><path d="M15 26l-2-12 10 9M41 23l10-9-2 12" fill="#d7aba0"/><circle cx="23" cy="34" r="2" fill="#506054"/><circle cx="41" cy="34" r="2" fill="#506054"/><path d="M29 40h6l-3 4z" fill="#af857a"/><path d="M28 47l4-3 4 3" stroke="#8c8070" fill="none"/></svg>`;
}
