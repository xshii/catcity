import type { CatBreed } from '../../content/breeds';
import type { CatAppearance } from '../../content/cats';
import type { CatEars, CatShape, Colour } from './cat-look';

/**
 * A cat's parts in the style board's 72×64 portrait space, each bottom to top (spec 041
 * cat-looks.md 1, ui-design 6.1). The breed gives the outline (ruff, ears, tail, the ball
 * it dozes in); the face reshapes its head; the pattern adds markings in the fur's shade;
 * the white adds white patches. The colour and the eyes only colour them (`catLook`).
 */
export interface CatParts {
  /** Behind the head: the map sprite's tail, swishing from its root beside the body (58, 50). */
  tail: readonly CatShape[];
  /** Fur at the cheeks, behind the face. */
  ruff: readonly CatShape[];
  /** The head and what lies on its fur. */
  head: readonly CatShape[];
  ears: Readonly<Record<CatEars, readonly CatShape[]>>;
  /** The dozing ball: one ear, a closed eye, the tail wrapped round and a drawn zZ. */
  curled: readonly CatShape[];
}

export type Fill = 'coat' | 'shade' | 'white';
/** Each fill's outline, one it stands out against (ui-design 2.2). */
export const EDGE = {
  coat: 'line',
  shade: 'shadeLine',
  white: 'whiteLine',
} as const satisfies Record<Fill, Colour>;
export const line = (d: string, stroke: Colour, width = 2): CatShape => ({
  d,
  stroke,
  width,
});
const part = (d: string, fill: Fill): CatShape => ({
  d,
  fill,
  stroke: EDGE[fill],
});
const move = (d: string, to: (x: number, y: number) => [number, number]) =>
  d.replace(/([\d.]+) ([\d.]+)/g, (_, x: string, y: string) =>
    to(Number(x), Number(y)).join(' '),
  );
/** A left part and its twin flipped across the portrait's middle (x = 36). */
const pair = (d: string, fill: Fill) => [
  part(d, fill),
  part(
    move(d, (x, y) => [72 - x, y]),
    fill,
  ),
];

/**
 * A head: half its width, the height of its widest point and of its crown; the crown's
 * and the jaw's curves ([x, y] control offsets); how far the jaw tucks in and how far the
 * chin sharpens above its point (36, 58); how far in from each side a bicolour's white
 * starts. The feet (36, 58) stay put for every head.
 */
interface HeadForm {
  half: number;
  mid: number;
  top: number;
  crown: readonly [number, number];
  jaw: readonly [number, number];
  tuck: number;
  chin: number;
  dip: number;
}
function headPaths(form: HeadForm) {
  const { half, mid, top, tuck, chin, dip } = form;
  const [[cx, cy], [jx, jy], l, r] = [
    form.crown,
    form.jaw,
    36 - half,
    36 + half,
  ];
  const jaw = `C${r - tuck} ${mid + jy} ${36 + jx} ${58 - chin} 36 58C${36 - jx} ${58 - chin} ${l + tuck} ${mid + jy} ${l} ${mid}`;
  return {
    outline: `M${l} ${mid}C${l} ${mid - cy} ${36 - cx} ${top} 36 ${top}C${36 + cx} ${top} ${r} ${mid - cy} ${r} ${mid}${jaw}Z`,
    // A bicolour's white face dips under each eye and rises between them.
    under: `M${l} ${mid}C${l + dip} ${mid + 6} 26 47 30 44C33 42 35 40 36 40C37 40 39 42 42 44C46 47 ${r - dip} ${mid + 6} ${r} ${mid}${jaw}Z`,
    edge: `M${r} ${mid}${jaw}`,
  };
}
type Face = CatAppearance['face'];
/** How each face reshapes a breed's head, and where it moves the (left) ears. */
const FACES: Record<
  Face,
  { head: (form: HeadForm) => HeadForm; ears: [number, number] }
> = {
  round: { head: (form) => form, ears: [0, 0] },
  // The jaw runs straight down to a narrow chin.
  pointed: {
    head: (form) => ({
      ...form,
      jaw: [4, form.jaw[1]],
      tuck: form.tuck + 3,
      chin: 3,
    }),
    ears: [0, 0],
  },
  // Taller and narrower: the crown rises, and the ears with it.
  long: {
    head: (form) => ({
      ...form,
      half: form.half - 3,
      top: form.top - 6,
      crown: [form.crown[0] - 2, form.crown[1] + 4],
    }),
    ears: [4, -4],
  },
};

interface BreedArt {
  head: HeadForm;
  /** Fur at the cheeks, behind the face (left side). */
  ruff: string | null;
  /** The left ear in each position. */
  ears: Record<CatEars, string>;
  tail: string;
  /** A tabby's rings round the tail. */
  rings: readonly string[];
  /** Dozing: the ear, and the tail wrapped round: fur, or a line for a short one. */
  curledEar: string;
  curledTail: string | { line: string };
}
/**
 * What a breed changes in the outline (ui-design 6.1): a ragdoll's fluffy cheek ruff and
 * plumed tail; a shorthair's rounder face, smaller rounded ears and short tail; a domestic
 * cat's face narrowing to its chin like a triangle, big upright ears and thin long tail.
 */
const BREEDS: Record<CatBreed, BreedArt> = {
  RAGDOLL: {
    head: {
      half: 24,
      mid: 40,
      top: 16,
      crown: [14, 14],
      jaw: [14, 14],
      tuck: 0,
      chin: 0,
      dip: 4,
    },
    ruff: 'M13 39Q6 39 9 45Q3 48 8 51Q4 56 12 56Q14 61 20 57Z',
    ears: {
      up: 'M18 26L15 12L26 21',
      mid: 'M16 28L10 16L23 23',
      down: 'M14 30L6 20L20 24',
    },
    tail: 'M56 53Q64 58 70 52Q78 50 77 42Q82 36 77 30Q78 22 71 22Q64 22 65 30Q64 38 60 44Q58 46 56 46Z',
    rings: ['M62 44Q68 47 75 43', 'M65 36Q71 39 78 36', 'M67 27Q71 29 76 27'],
    curledEar: 'M18 32L16 22L25 28',
    curledTail:
      'M59 41Q68 44 66 52Q68 60 58 60Q52 64 45 60Q40 56 47 55Q56 56 59 41Z',
  },
  BRITISH_SHORTHAIR: {
    head: {
      half: 26,
      mid: 41,
      top: 18,
      crown: [15, 14],
      jaw: [15, 13],
      tuck: 0,
      chin: 0,
      dip: 5,
    },
    ruff: null,
    ears: {
      up: 'M17 28Q13 10 28 21',
      mid: 'M14 30Q8 16 25 24',
      down: 'M12 33Q4 24 22 27',
    },
    tail: 'M57 53C63 54 67 50 66 45C65 42 61 43 61 46C61 48 59 48 56 48Z',
    rings: ['M60 48Q62 50 61 52', 'M64 44Q66 46 64 49'],
    curledEar: 'M18 33Q14 22 26 28',
    curledTail: { line: 'M62 48Q66 54 60 57' },
  },
  DOMESTIC: {
    head: {
      half: 24,
      mid: 37,
      top: 17,
      crown: [14, 12],
      jaw: [8, 17],
      tuck: 2,
      chin: 1,
      dip: 4,
    },
    ruff: null,
    ears: {
      up: 'M17 27L12 5L29 19',
      mid: 'M15 29L6 11L27 21',
      down: 'M14 31L3 17L23 24',
    },
    tail: 'M56 52Q68 53 71 42Q73 30 69 17Q67 14 65 17Q67 30 65 40Q63 46 56 47Z',
    rings: ['M65 44L69 45', 'M67 34L70 33', 'M67 24L69 24'],
    curledEar: 'M18 32L13 17L27 27',
    curledTail:
      'M60 41Q69 45 66 53Q62 61 48 60Q43 59 45 56Q57 57 61 51Q63 46 58 44Z',
  },
};

/** The dozing ball; a bicolour's white belly shares its lower edge. */
const BALL = {
  outline:
    'M10 46C10 34 22 26 36 26C50 26 62 34 62 46C62 58 50 58 36 58C22 58 10 58 10 46Z',
  under: 'M10 46C20 52 52 52 62 46C62 58 50 58 36 58C22 58 10 58 10 46Z',
  edge: 'M62 46C62 58 50 58 36 58C22 58 10 58 10 46',
};
const DOZING_EYE = line('M22 42Q26 45 30 42', 'eye');
const zZ = [
  line('M48 14L56 14L48 22L56 22', 'doze', 1.8),
  line('M58 6L63 6L58 11L63 11', 'doze', 1.8),
];
const shade = (d: string, width = 2): CatShape => line(d, 'shade', width);
const white = (d: string): CatShape => ({ d, fill: 'white' });
/** Markings on the head and on the dozing ball: a tabby's M and stripes, a point's mask. */
const MARKS = {
  solid: { head: [], ball: [] },
  tabby: {
    head: [shade('M28 30L30 24L36 29L42 24L44 30', 1.8)],
    ball: [
      'M30 28Q32 33 30 37',
      'M40 27Q42 32 40 36',
      'M50 30Q52 35 50 39',
    ].map((d) => shade(d, 2.2)),
  },
  point: {
    head: [{ ellipse: [36, 44, 14, 9.5], fill: 'shade' }],
    ball: [{ ellipse: [25, 43, 8, 5.5], fill: 'shade' }],
  },
} satisfies Record<
  CatAppearance['pattern'],
  Record<'head' | 'ball', CatShape[]>
>;
/** White patches on the head and on the dozing ball: a bib's chin, a cow's patches. */
const PATCHES: Record<
  CatAppearance['white'],
  Record<'head' | 'ball', CatShape[]>
> = {
  none: { head: [], ball: [] },
  mittens: { head: [], ball: [] },
  bicolour: { head: [], ball: [] },
  bib: { head: [{ ellipse: [36, 54, 7, 3], fill: 'white' }], ball: [] },
  cow: {
    head: [white('M17 31Q19 22 28 22Q33 26 29 31Q24 34 17 31Z')],
    ball: [white('M40 31Q50 29 54 37Q52 45 44 43Q38 39 40 31Z')],
  },
};

/**
 * Fur with what lies on it: the markings, the white patches, and the underside, which is
 * T-13's (the fur's own colour) or a bicolour's white over the markings. A bicolour's
 * edge on the outline is drawn again in the white's own line.
 */
function fur(
  paths: { outline: string; under: string; edge: string },
  marks: readonly CatShape[],
  patches: readonly CatShape[],
  bicolour: boolean,
): CatShape[] {
  const under: CatShape = { d: paths.under, fill: bicolour ? 'white' : 'coat' };
  return [
    { d: paths.outline, fill: 'coat' },
    ...(bicolour ? [...marks, under] : [under, ...marks]),
    ...patches,
    { d: paths.outline, stroke: 'line' },
    ...(bicolour ? [line(paths.edge, 'whiteLine')] : []),
  ];
}

export function catParts(
  breed: CatBreed,
  { pattern, white: patch, face }: CatAppearance,
): CatParts {
  const art = BREEDS[breed];
  const bicolour = patch === 'bicolour';
  const point: Fill = pattern === 'point' ? 'shade' : 'coat';
  const [dx, dy] = FACES[face].ears;
  const ear = (d: string) =>
    pair(
      move(d, (x, y) => [x + dx, y + dy]),
      point,
    );
  const tail = (d: string | { line: string }) =>
    typeof d === 'string' ? part(d, point) : line(d.line, 'line');
  return {
    tail: [
      tail(art.tail),
      ...(pattern === 'tabby' ? art.rings.map((d) => shade(d)) : []),
    ],
    ruff: art.ruff ? pair(art.ruff, bicolour ? 'white' : 'coat') : [],
    head: fur(
      headPaths(FACES[face].head(art.head)),
      MARKS[pattern].head,
      PATCHES[patch].head,
      bicolour,
    ),
    ears: {
      up: ear(art.ears.up),
      mid: ear(art.ears.mid),
      down: ear(art.ears.down),
    },
    curled: [
      ...fur(BALL, MARKS[pattern].ball, PATCHES[patch].ball, bicolour),
      part(art.curledEar, point),
      DOZING_EYE,
      tail(art.curledTail),
      ...zZ,
    ],
  };
}
