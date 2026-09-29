import type { PetSpot } from '../../content/petting';
import {
  portraitShapes,
  type CatCoat,
  type CatPose,
  type CatShape,
} from './cat-look';
import { shapeSvg } from './illustrations';

/** The petting screen's drawing space: a cat lying on its side, head toward the player. */
const PETTING_ART = { width: 160, height: 100 } as const;
/** Where the 72×64 head of `CAT_ART` sits in that space. */
const HEAD = { x: 0, y: 24, scale: 1.12 } as const;

/** Where each spot is stroked, in percent of the drawing: head and chin in front. */
export const PET_SPOT_POINTS: Record<PetSpot, { x: number; y: number }> = {
  HEAD: { x: 25, y: 38 },
  CHIN: { x: 25, y: 90 },
  BACK: { x: 66, y: 38 },
  BELLY: { x: 68, y: 82 },
};

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
export function pettingCat(coat: CatCoat, pose: CatPose): string {
  const draw = (shapes: readonly CatShape[]) =>
    shapes.map((shape) => shapeSvg(shape, coat)).join('');
  return (
    `<svg viewBox="0 0 ${PETTING_ART.width} ${PETTING_ART.height}" aria-hidden="true" focusable="false">` +
    `<ellipse cx="92" cy="94" rx="64" ry="5" fill="#8a6f5a" opacity=".12"/>` +
    draw(BODY) +
    `<g transform="translate(${HEAD.x} ${HEAD.y}) scale(${HEAD.scale})">${draw(portraitShapes({ ...pose, curled: false }))}</g>` +
    draw(FRONT_PAWS) +
    '</svg>'
  );
}
