import type { CatBreed } from '../../content/breeds';
import type { CatAppearance } from '../../content/cats';
import { moodBand, type MoodBand } from '../../content/mood';
import { catIdle, MAX_STAT, type CatEntity, type WorldState } from '../../core';
import { catParts, line, type CatParts } from './cat-parts';

/** The breeds the art draws: the game's two, and the domestic cat T-14 PR 2 brings in. */
export type ArtBreed = CatBreed | 'DOMESTIC';
export const ART_BREEDS: readonly ArtBreed[] = [
  'DOMESTIC',
  'RAGDOLL',
  'BRITISH_SHORTHAIR',
];
type CatCoat = CatEntity['appearance']['coat'];
const plain = (
  colour: CatAppearance['colour'],
  eyes: CatAppearance['eyes'],
  white: CatAppearance['white'] = 'none',
): CatAppearance => ({ colour, pattern: 'solid', white, eyes, face: 'round' });
/** T-13's coats as five choices, until T-14 PR 2 saves the five on the cat. */
export const COAT_APPEARANCE: Record<CatCoat, CatAppearance> = {
  cream: plain('cream', 'blue'),
  gray: plain('gray', 'copper'),
  orange: plain('orange', 'green'),
  tuxedo: plain('black', 'green', 'bicolour'),
};
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
  coatGray: '#cbd2d1',
  coatOrange: '#ffc681',
  coatBlack: '#6b5d55',
  coatWhite: '#fffaf0',
  coatBrown: '#94684a',
  coatCreamShade: '#85644c',
  coatGrayShade: '#6f7a7e',
  coatOrangeShade: '#b86a3a',
  coatBlackShade: '#3f3530',
  coatWhiteShade: '#8f7f72',
  coatBrownShade: '#5f3f2d',
  eyeBlue: '#7eb3dd',
  eyeCopper: '#d98b3a',
  eyeGreen: '#b8c24c',
} as const;
const T = CAT_TOKENS;
/** Each fur colour and its shade: a tabby's stripes, a point's mask, ears, tail and paws. */
const FURS: Record<CatAppearance['colour'], readonly [string, string]> = {
  black: [T.coatBlack, T.coatBlackShade],
  gray: [T.coatGray, T.coatGrayShade],
  orange: [T.coatOrange, T.coatOrangeShade],
  cream: [T.coatCream, T.coatCreamShade],
  white: [T.coatWhite, T.coatWhiteShade],
  brown: [T.coatBrown, T.coatBrownShade],
};
/** Fur too dark for warm-brown lines and ink; every shade is dark too. */
const DARK_FURS: ReadonlySet<CatAppearance['colour']> = new Set([
  'black',
  'brown',
]);
const IRIS: Record<CatAppearance['eyes'], string> = {
  blue: T.eyeBlue,
  copper: T.eyeCopper,
  green: T.eyeGreen,
};
/** Names of the colours a shape is painted in; each look gives each its value. */
export type Colour =
  | 'coat'
  | 'shade'
  | 'white'
  | 'line'
  | 'shadeLine'
  | 'whiteLine'
  | 'eye'
  | 'mouth'
  | 'iris'
  | 'pupil'
  | 'blush'
  | 'blushSoft'
  | 'tear'
  | 'doze';

/**
 * A look's colours. On light fur, lines are warm brown and eyes ink; on dark fur (black,
 * brown, and every shade) both are paper, to be seen at 3:1 or more (ui-design 2.2). The
 * eyes sit on the fur or a point's mask; the mouth on either, or on a bicolour's white.
 */
function colours({
  colour,
  pattern,
  white,
  eyes,
}: CatAppearance): Record<Colour, string> {
  const [coat, shade] = FURS[colour];
  const dark = DARK_FURS.has(colour);
  const darkFace = dark || pattern === 'point';
  const darkMouth = white !== 'bicolour' && darkFace;
  return {
    coat,
    shade,
    white: T.coatWhite,
    line: dark ? T.paper : T.brown,
    shadeLine: T.paper,
    whiteLine: T.brown,
    eye: darkFace ? T.paper : T.ink,
    mouth: darkMouth ? T.paper : T.brown,
    iris: IRIS[eyes],
    pupil: T.ink,
    blush: T.sakura,
    blushSoft: '#f7cfc8',
    tear: T.mint,
    doze: '#a08a75',
  };
}

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

/** What sets one cat's drawing apart (ui-design 6.1, R-15): every renderer draws a cat from this. */
export interface CatLook extends CatParts {
  breed: ArtBreed;
  appearance: Readonly<CatAppearance>;
  colours: Readonly<Record<Colour, string>>;
}
const looks = new Map<string, CatLook>();
/** The look of a breed and five choices: the same object for the same ones, to compare. */
export function catLook(breed: ArtBreed, appearance: CatAppearance): CatLook {
  const { colour, pattern, white, eyes, face } = appearance;
  const key = [breed, colour, pattern, white, eyes, face].join('/');
  let look = looks.get(key);
  if (!look) {
    look = {
      breed,
      appearance: { colour, pattern, white, eyes, face },
      colours: colours(appearance),
      ...catParts(breed, appearance),
    };
    looks.set(key, look);
  }
  return look;
}
/** A cat's look: its breed and its coat's five choices (T-14 PR 2: its own five). */
export const lookOf = (cat: CatEntity): CatLook =>
  catLook(cat.breedId, COAT_APPEARANCE[cat.appearance.coat]);

const cheeks = (y: number, rx: number, ry: number, fill: Colour) =>
  [22, 50].map((x): CatShape => ({ ellipse: [x, y, rx, ry], fill }));

/** The eyes and the face each mood draws on any cat. */
export const CAT_ART = {
  eyes: {
    happy: [
      line('M25 38Q29 33 33 38', 'eye', 2.2),
      line('M39 38Q43 33 47 38', 'eye', 2.2),
    ],
    // Open eyes show their colour round a dark pupil.
    calm: [29, 43].flatMap((x): CatShape[] => [
      { ellipse: [x, 38, 2.8, 3.4], fill: 'iris', stroke: 'eye', width: 1 },
      { ellipse: [x, 38.4, 1, 2.3], fill: 'pupil' },
    ]),
    glum: [line('M25 38L33 38', 'eye', 2.2), line('M39 38L47 38', 'eye', 2.2)],
    low: [
      line('M25 36Q29 40 33 36', 'eye', 2.2),
      line('M39 36Q43 40 47 36', 'eye', 2.2),
    ],
  } satisfies Record<MoodBand, CatShape[]>,
  /** Cheeks and mouth; below the eyes. */
  face: {
    happy: [
      ...cheeks(44, 4.5, 2.8, 'blush'),
      line('M32 46Q36 50 40 46', 'mouth'),
    ],
    calm: [
      ...cheeks(45, 4, 2.4, 'blushSoft'),
      line('M34 46L36 48L38 46', 'mouth', 1.8),
    ],
    glum: [line('M33 48L39 48', 'mouth')],
    low: [
      line('M26 42L26 47', 'tear', 2.4),
      line('M32 50Q36 47 40 50', 'mouth'),
    ],
  } satisfies Record<MoodBand, CatShape[]>,
} as const;

/** The portrait's shapes for a look and pose, bottom to top: the map cat without its tail. */
export function portraitShapes(
  look: CatLook,
  pose: CatPose,
): readonly CatShape[] {
  if (pose.curled) return look.curled;
  return [
    ...look.ruff,
    ...look.head,
    ...look.ears[pose.ears],
    ...CAT_ART.eyes[pose.face],
    ...CAT_ART.face[pose.face],
  ];
}
