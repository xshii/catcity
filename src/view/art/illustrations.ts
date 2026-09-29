import type { FishId } from '../../content/fishing';
import {
  colourOf,
  portraitShapes,
  type CatCoat,
  type CatPose,
} from './cat-look';

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
/** A dark fish shape under the water, facing right; the species stays unknown. */
export function fishShadow(): string {
  return `<svg viewBox="10 5 140 80" aria-hidden="true"><path d="M52 43L16 18Q24 43 16 68L52 48" fill="#2f4a44"/><ellipse cx="99" cy="44" rx="53" ry="27" fill="#2f4a44"/><circle cx="131" cy="36" r="4" fill="#fffdf4" opacity=".8"/></svg>`;
}
/** A cat's head as its pose shows it (style board 猫咪表情); the words live beside it. */
export function catPortrait(coat: CatCoat, pose: CatPose): string {
  const shapes = portraitShapes(pose).map((shape) => {
    const fill = shape.fill ? colourOf(shape.fill, coat) : 'none';
    const stroke = shape.stroke
      ? ` stroke="${colourOf(shape.stroke, coat)}" stroke-width="${shape.width ?? 2}" stroke-linecap="round" stroke-linejoin="round"`
      : '';
    if (!shape.ellipse) return `<path d="${shape.d}" fill="${fill}"${stroke}/>`;
    const [cx, cy, rx, ry] = shape.ellipse;
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${stroke}/>`;
  });
  return `<svg viewBox="4 0 64 64" aria-hidden="true">${shapes.join('')}</svg>`;
}
