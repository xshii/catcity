import type { CatBreed } from '../../content/breeds';
import { moodBand, type MoodBand } from '../../content/mood';
import { catIdle, MAX_STAT, type CatEntity, type WorldState } from '../../core';

export type CatCoat = CatEntity['appearance']['coat'];
/** What sets one cat's drawing apart from another's (ui-design 6.1, R-15). */
export interface CatLook {
  coat: CatCoat;
  breed: CatBreed;
}
/** The look of a cat: every renderer draws a cat from this. */
export const catLook = (cat: CatEntity): CatLook => ({
  coat: cat.appearance.coat,
  breed: cat.breedId,
});
export type CatEars = 'up' | 'mid' | 'down';
/** How a cat is drawn; the map sprite and the card portrait only render this. */
export interface CatPose {
  face: MoodBand;
  ears: CatEars;
  curled: boolean;
}
/** A small move a cat makes as it answers the player (R-03): a hop, a head tilt, or none. */
export type CatMotion = 'hop' | 'tilt' | 'none';

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

/**
 * The art's colours from styles/tokens.css: `CAT_TOKENS` mirrors the values of the tokens
 * of the same name (a unit test keeps them equal).
 */
export const CAT_TOKENS = {
  paper: '#fbf6ec',
  brown: '#8a6f5a',
  ink: '#5e4b3e',
  sakura: '#f2b8b5',
  mint: '#9ccfc8',
  coatCream: '#f7e3c4',
  coatGray: '#c9d0cf',
  coatOrange: '#f2b880',
  coatBlack: '#6b5d55',
  coatWhite: '#fffaf0',
} as const;
const T = CAT_TOKENS;
/**
 * Each coat's fur, its underside (a tuxedo's lower face, chest and belly) and the eyes on
 * its fur: paper on a tuxedo's dark crown, to be seen (ui-design 6.1).
 */
const COATS: Record<CatCoat, Record<'coat' | 'under' | 'eye', string>> = {
  cream: { coat: T.coatCream, under: T.coatCream, eye: T.ink },
  gray: { coat: T.coatGray, under: T.coatGray, eye: T.ink },
  orange: { coat: T.coatOrange, under: T.coatOrange, eye: T.ink },
  tuxedo: { coat: T.coatBlack, under: T.coatWhite, eye: T.paper },
};
/** Colours every coat shares; the outline stays warm brown on any fur. */
const CAT_COLOURS = {
  line: T.brown,
  blush: T.sakura,
  blushSoft: '#f7cfc8',
  tear: T.mint,
  doze: '#a08a75',
} as const;
type Colour = keyof typeof CAT_COLOURS | 'coat' | 'under' | 'eye';

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
/** A path flipped left to right across the portrait's middle (x = 36). */
const mirror = (d: string) =>
  d.replace(
    /([\d.]+) ([\d.]+)/g,
    (_, x: string, y: string) => `${72 - Number(x)} ${y}`,
  );
/** Light fur: a tuxedo's white, any other coat's own colour. */
const tuft = (d: string): CatShape => ({ d, fill: 'under', stroke: 'line' });
/** A left part and its mirrored right twin. */
const pair = (d: string, part = fur) => [part(d), part(mirror(d))];
/**
 * Fur with its light underside, which shares the fur's lower edge; the outline goes over
 * both.
 */
const furAndUnder = (d: string, under: string): CatShape[] => [
  { d, fill: 'coat' },
  { d: under, fill: 'under' },
  { d, stroke: 'line' },
];
const cheeks = (y: number, rx: number, ry: number, fill: Colour) =>
  [22, 50].map((x): CatShape => ({ ellipse: [x, y, rx, ry], fill }));
const zZ = [
  line('M48 14L56 14L48 22L56 22', 'doze', 1.8),
  line('M58 6L63 6L58 11L63 11', 'doze', 1.8),
];
/** The dozing ball's body, light below; its ear and wrapped tail are the breed's. */
const BALL = furAndUnder(
  'M10 46C10 34 22 26 36 26C50 26 62 34 62 46C62 58 50 58 36 58C22 58 10 58 10 46Z',
  'M10 46C20 52 52 52 62 46C62 58 50 58 36 58C22 58 10 58 10 46Z',
);
const DOZING_EYE = line('M22 42Q26 45 30 42', 'eye');

/**
 * What a breed changes in the outline (ui-design 6.1): a ragdoll's fluffy cheek ruff and
 * plumed tail; a shorthair's rounder face, smaller rounded ears and short tail.
 */
interface BreedArt {
  /** Fur at the cheeks, behind the face. */
  ruff: readonly CatShape[];
  head: readonly CatShape[];
  ears: Record<CatEars, readonly CatShape[]>;
  /** The map sprite's tail, swishing from its root beside the body (58, 50). */
  tail: readonly CatShape[];
  /** The dozing ball: one ear, a closed eye, the tail wrapped round and a drawn zZ. */
  curled: readonly CatShape[];
}

/** The parts both renderers draw, keyed by the breed and pose they belong to. */
export const CAT_ART = {
  breeds: {
    RAGDOLL: {
      ruff: pair('M13 39Q6 39 9 45Q3 48 8 51Q4 56 12 56Q14 61 20 57Z', tuft),
      // The light lower face dips under each eye and rises between them.
      head: furAndUnder(
        'M12 40C12 26 22 16 36 16C50 16 60 26 60 40C60 54 50 58 36 58C22 58 12 54 12 40Z',
        'M12 40C16 46 26 47 30 44C33 42 35 40 36 40C37 40 39 42 42 44C46 47 56 46 60 40C60 54 50 58 36 58C22 58 12 54 12 40Z',
      ),
      ears: {
        up: pair('M18 26L15 12L26 21'),
        mid: pair('M16 28L10 16L23 23'),
        down: pair('M14 30L6 20L20 24'),
      },
      tail: [
        fur(
          'M56 53Q64 58 70 52Q78 50 77 42Q82 36 77 30Q78 22 71 22Q64 22 65 30Q64 38 60 44Q58 46 56 46Z',
        ),
      ],
      curled: [
        ...BALL,
        fur('M18 32L16 22L25 28'),
        DOZING_EYE,
        fur(
          'M59 41Q68 44 66 52Q68 60 58 60Q52 64 45 60Q40 56 47 55Q56 56 59 41Z',
        ),
        ...zZ,
      ],
    },
    BRITISH_SHORTHAIR: {
      ruff: [],
      head: furAndUnder(
        'M10 41C10 27 21 18 36 18C51 18 62 27 62 41C62 54 51 58 36 58C21 58 10 54 10 41Z',
        'M10 41C15 47 26 47 30 44C33 42 35 40 36 40C37 40 39 42 42 44C46 47 57 47 62 41C62 54 51 58 36 58C21 58 10 54 10 41Z',
      ),
      ears: {
        up: pair('M17 28Q13 10 28 21'),
        mid: pair('M14 30Q8 16 25 24'),
        down: pair('M12 33Q4 24 22 27'),
      },
      tail: [
        fur('M57 53C63 54 67 50 66 45C65 42 61 43 61 46C61 48 59 48 56 48Z'),
      ],
      curled: [
        ...BALL,
        fur('M18 33Q14 22 26 28'),
        DOZING_EYE,
        line('M62 48Q66 54 60 57'),
        ...zZ,
      ],
    },
  } satisfies Record<CatBreed, BreedArt>,
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
} as const;

/** The portrait's shapes for a breed and pose, bottom to top: the map cat without its tail. */
export function portraitShapes(
  breed: CatBreed,
  pose: CatPose,
): readonly CatShape[] {
  const art = CAT_ART.breeds[breed];
  if (pose.curled) return art.curled;
  return [
    ...art.ruff,
    ...art.head,
    ...art.ears[pose.ears],
    ...CAT_ART.eyes[pose.face],
    ...CAT_ART.face[pose.face],
  ];
}

export const colourOf = (colour: Colour, coat: CatCoat): string =>
  colour === 'coat' || colour === 'under' || colour === 'eye'
    ? COATS[coat][colour]
    : CAT_COLOURS[colour];
