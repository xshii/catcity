import { moodBand, type MoodBand } from '../../content/mood';
import { catIdle, MAX_STAT, type CatEntity, type WorldState } from '../../core';

export type CatCoat = CatEntity['appearance']['coat'];
export type CatEars = 'up' | 'mid' | 'down';
/** How a cat is drawn; the map sprite and the card portrait only render this. */
export interface CatPose {
  face: MoodBand;
  ears: CatEars;
  curled: boolean;
}

const EARS: Record<MoodBand, CatEars> = {
  happy: 'up',
  calm: 'up',
  glum: 'mid',
  low: 'down',
};

/**
 * A cat's look (style board 猫咪表情): face and ears follow its mood band; a cat that
 * recovers energy by itself (idle as Core's `catIdle` says, below full) curls up to
 * doze. A walking or fishing cat is not idle, so it stays up. `atRiver`: drawn as the
 * cat fishing with the player at the river, which stays awake between casts (R-01).
 */
export function catPose(
  world: WorldState,
  cat: CatEntity,
  { atRiver }: { atRiver: boolean } = { atRiver: false },
): CatPose {
  const face = moodBand(cat.mood);
  return {
    face,
    ears: EARS[face],
    curled: !atRiver && catIdle(world, cat) && cat.needs.energy < MAX_STAT,
  };
}

/** Art colours from the palette in tokens.css; `coat` fills are the fur. */
const CAT_COLOURS = {
  coat: { cream: '#f7e3c4', gray: '#c9d0cf' },
  line: '#8a6f5a',
  eye: '#5e4b3e',
  blush: '#f2b8b5',
  blushSoft: '#f7cfc8',
  tear: '#9ccfc8',
  doze: '#a08a75',
} as const;
type Colour = Exclude<keyof typeof CAT_COLOURS, 'coat'> | 'coat';

/**
 * One shape of the art in the style board's 72×64 portrait space: an ellipse
 * `[cx, cy, rx, ry]` or an absolute M/L/Q/C/Z path, filled and/or stroked.
 */
export interface CatShape {
  d?: string;
  ellipse?: readonly [number, number, number, number];
  fill?: Colour;
  stroke?: Colour;
  width?: number;
}

const line = (d: string, stroke: Colour = 'line', width = 2): CatShape => ({
  d,
  stroke,
  width,
});
const fur = (d: string): CatShape => ({ d, fill: 'coat', stroke: 'line' });
const cheeks = (y: number, rx: number, ry: number, fill: Colour) =>
  [22, 50].map((x): CatShape => ({ ellipse: [x, y, rx, ry], fill }));

/** The parts both renderers draw, keyed by the pose they belong to. */
export const CAT_ART = {
  head: [
    fur(
      'M12 40C12 26 22 16 36 16C50 16 60 26 60 40C60 54 50 58 36 58C22 58 12 54 12 40Z',
    ),
  ],
  ears: {
    up: [fur('M18 26L15 12L26 21'), fur('M54 26L57 12L46 21')],
    mid: [fur('M16 28L10 16L23 23'), fur('M56 28L62 16L49 23')],
    down: [fur('M14 30L6 20L20 24'), fur('M58 30L66 20L52 24')],
  } satisfies Record<CatEars, CatShape[]>,
  eyes: {
    happy: [
      line('M25 38Q29 33 33 38', 'eye', 2.2),
      line('M39 38Q43 33 47 38', 'eye', 2.2),
    ],
    calm: [29, 43].map((x): CatShape => ({
      ellipse: [x, 38, 2.6, 3.4],
      fill: 'eye',
    })),
    glum: [line('M25 38L33 38', 'eye', 2.2), line('M39 38L47 38', 'eye', 2.2)],
    low: [
      line('M25 36Q29 40 33 36', 'eye', 2.2),
      line('M39 36Q43 40 47 36', 'eye', 2.2),
    ],
  } satisfies Record<MoodBand, CatShape[]>,
  /** Cheeks and mouth; below the eyes. */
  face: {
    happy: [...cheeks(44, 4.5, 2.8, 'blush'), line('M32 46Q36 50 40 46')],
    calm: [
      ...cheeks(45, 4, 2.4, 'blushSoft'),
      line('M34 46L36 48L38 46', 'line', 1.8),
    ],
    glum: [line('M33 48L39 48')],
    low: [line('M26 42L26 47', 'tear', 2.4), line('M32 50Q36 47 40 50')],
  } satisfies Record<MoodBand, CatShape[]>,
  /** The dozing ball: one ear, a closed eye, the tail wrapped round and a drawn zZ. */
  curled: [
    fur(
      'M10 46C10 34 22 26 36 26C50 26 62 34 62 46C62 58 50 58 36 58C22 58 10 58 10 46Z',
    ),
    fur('M18 32L16 22L25 28'),
    line('M22 42Q26 45 30 42', 'eye'),
    line('M62 46Q68 54 56 58'),
    line('M48 14L56 14L48 22L56 22', 'doze', 1.8),
    line('M58 6L63 6L58 11L63 11', 'doze', 1.8),
  ],
  /** The map sprite's tail, swishing from its root beside the body. */
  tail: [
    line('M58 50Q72 48 70 34', 'line', 7),
    line('M58 50Q72 48 70 34', 'coat', 4),
  ],
} as const;

/** The portrait's shapes for a pose, bottom to top. */
export function portraitShapes(pose: CatPose): readonly CatShape[] {
  if (pose.curled) return CAT_ART.curled;
  return [
    ...CAT_ART.head,
    ...CAT_ART.ears[pose.ears],
    ...CAT_ART.eyes[pose.face],
    ...CAT_ART.face[pose.face],
  ];
}

export const colourOf = (colour: Colour, coat: CatCoat): string =>
  colour === 'coat' ? CAT_COLOURS.coat[coat] : CAT_COLOURS[colour];
