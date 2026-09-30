import type { PetSpot } from '../../content/petting';
import {
  portraitShapes,
  type CatLook,
  type CatPose,
  type CatShape,
} from './cat-look';
import { EDGE, line, type Fill } from './cat-parts';
import { shapeSvg } from './illustrations';

/** The petting screen's drawing space: a cat lying on its side, head toward the player. */
export const PETTING_ART = { width: 160, height: 100 } as const;
/** Where the 72×64 head of `CAT_ART` sits in that space. */
const HEAD = { x: 0, y: 24, scale: 1.12 } as const;

/**
 * Where each spot is stroked (ui-design 5.5): an ellipse `[cx, cy, rx, ry]` on the cat, in
 * the drawing's units. Nothing marks them; they glow when touched. Head: between the ears
 * down to the brow. Chin: round the mouth down to the chest. Back: along the spine to the tail.
 * Belly: the body's lower edge. The eyes and nose between head and chin are no spot.
 */
export const PET_SPOT_REGIONS: Record<
  PetSpot,
  readonly [number, number, number, number]
> = {
  HEAD: [40, 52, 22, 11],
  CHIN: [46, 84, 20, 11],
  BACK: [106, 50, 34, 13],
  BELLY: [108, 79, 30, 12],
};

/** The spot under a point of the drawing, if any. */
export function spotAt(point: { x: number; y: number }): PetSpot | null {
  for (const [spot, [cx, cy, rx, ry]] of Object.entries(PET_SPOT_REGIONS))
    if (((point.x - cx) / rx) ** 2 + ((point.y - cy) / ry) ** 2 <= 1)
      return spot as PetSpot;
  return null;
}

/** The regions as shapes laid over the drawing, one to glow for each spot. */
export function pettingRegions(): string {
  return (
    `<svg viewBox="0 0 ${PETTING_ART.width} ${PETTING_ART.height}" aria-hidden="true" focusable="false">` +
    Object.entries(PET_SPOT_REGIONS)
      .map(
        ([spot, [cx, cy, rx, ry]]) =>
          `<ellipse data-region="${spot}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`,
      )
      .join('') +
    '</svg>'
  );
}

const TAIL = 'M140 74Q160 70 153 46';
const BODY =
  'M44 78C44 52 68 36 100 36C130 36 150 52 150 72C150 88 138 92 100 92C66 92 44 92 44 78Z';
/** Markings and white on the body, as on the head (spec 041 cat-looks.md 1). */
const TABBY = [
  // Rings round the tail and stripes down the back.
  ...['M147 67L152 73', 'M151 61L158 63', 'M151 53L158 52'],
  ...['M86 40Q89 46 86 52', 'M100 38Q103 45 100 51', 'M114 39Q117 46 114 52'],
  'M128 43Q131 49 127 55',
].map((d) => line(d, 'shade', 2.2));
const COW: CatShape[] = [
  'M92 50Q104 42 116 50Q120 60 106 62Q94 62 92 50Z',
  'M128 64Q138 58 144 68Q142 78 132 76Q126 72 128 64Z',
].map((d) => ({ d, fill: 'white' }));
const CHEST: CatShape = { ellipse: [86, 81, 11, 8], fill: 'white' };
/** A bicolour's white belly, sharing the body's lower edge. */
const BELLY: CatShape[] = [
  {
    d: 'M44 78C62 72 128 70 150 72C150 88 138 92 100 92C66 92 44 92 44 78Z',
    fill: 'white',
  },
  line('M150 72C150 88 138 92 100 92C66 92 44 92 44 78', 'whiteLine'),
];

/**
 * The body behind the head (`back`: the tail curled up behind it, the fold of the belly and
 * the hind paw tucked under it) and the front paw before it, in the portrait's line and fur.
 * A point's tail and paws are its shade; mittens and a bicolour whiten the paws.
 */
export function pettingBody({ appearance: { pattern, white } }: CatLook): {
  back: CatShape[];
  front: CatShape[];
} {
  const bicolour = white === 'bicolour';
  const tail: Fill = pattern === 'point' ? 'shade' : 'coat';
  const paw: Fill =
    white === 'mittens' || bicolour
      ? 'white'
      : tail === 'shade'
        ? 'shade'
        : 'coat';
  const paws = (ellipse: [number, number, number, number]): CatShape => ({
    ellipse,
    fill: paw,
    stroke: EDGE[paw],
  });
  return {
    back: [
      line(TAIL, EDGE[tail], 9),
      line(TAIL, tail, 6),
      { d: BODY, fill: 'coat', stroke: 'line' },
      ...(pattern === 'tabby' ? TABBY : []),
      ...(white === 'cow' ? COW : []),
      ...(white === 'bib' ? [CHEST] : []),
      ...(bicolour ? BELLY : []),
      line('M84 84Q106 90 128 83', bicolour ? 'whiteLine' : 'line', 1.6),
      paws([128, 90, 11, 5]),
    ],
    front: [paws([70, 91, 9, 5])],
  };
}

/** The whole cat as the petting screen shows it; the face and ears follow `pose`. */
export function pettingCat(look: CatLook, pose: CatPose): string {
  const draw = (shapes: readonly CatShape[]) =>
    shapes.map((shape) => shapeSvg(shape, look.colours)).join('');
  const { back, front } = pettingBody(look);
  return (
    `<svg viewBox="0 0 ${PETTING_ART.width} ${PETTING_ART.height}" aria-hidden="true" focusable="false">` +
    `<ellipse cx="92" cy="94" rx="64" ry="5" fill="#8a6f5a" opacity=".12"/>` +
    draw(back) +
    `<g transform="translate(${HEAD.x} ${HEAD.y}) scale(${HEAD.scale})">${draw(portraitShapes(look, { ...pose, curled: false }))}</g>` +
    draw(front) +
    '</svg>'
  );
}
