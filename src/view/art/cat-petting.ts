import type { PetSpot } from '../../content/petting';
import {
  portraitShapes,
  type CatLook,
  type CatPose,
  type CatShape,
} from './cat-look';
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

/** The body behind the head, in the same warm line and fur as the portrait. */
const BODY: readonly CatShape[] = [
  // The tail curls up behind the back.
  { d: 'M140 74Q160 70 153 46', stroke: 'line', width: 9 },
  { d: 'M140 74Q160 70 153 46', stroke: 'coat', width: 6 },
  {
    d: 'M44 78C44 52 68 36 100 36C130 36 150 52 150 72C150 88 138 92 100 92C66 92 44 92 44 78Z',
    fill: 'coat',
    stroke: 'line',
  },
  // The belly's soft fold and the hind paw tucked under it.
  { d: 'M84 84Q106 90 128 83', stroke: 'line', width: 1.6 },
  { ellipse: [128, 90, 11, 5], fill: 'coat', stroke: 'line' },
];
const FRONT_PAWS: readonly CatShape[] = [
  { ellipse: [70, 91, 9, 5], fill: 'coat', stroke: 'line' },
];

/** The whole cat as the petting screen shows it; the face and ears follow `pose`. */
export function pettingCat({ coat, breed }: CatLook, pose: CatPose): string {
  const draw = (shapes: readonly CatShape[]) =>
    shapes.map((shape) => shapeSvg(shape, coat)).join('');
  return (
    `<svg viewBox="0 0 ${PETTING_ART.width} ${PETTING_ART.height}" aria-hidden="true" focusable="false">` +
    `<ellipse cx="92" cy="94" rx="64" ry="5" fill="#8a6f5a" opacity=".12"/>` +
    draw(BODY) +
    `<g transform="translate(${HEAD.x} ${HEAD.y}) scale(${HEAD.scale})">${draw(portraitShapes(breed, { ...pose, curled: false }))}</g>` +
    draw(FRONT_PAWS) +
    '</svg>'
  );
}
