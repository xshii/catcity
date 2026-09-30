import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAT_BREED_IDS, type CatBreed } from '../../src/content/breeds';
import {
  APPEARANCE_OPTIONS,
  CAT_COATS,
  type CatAppearance,
} from '../../src/content/cats';
import {
  ART_BREEDS,
  CAT_TOKENS,
  COAT_APPEARANCE,
  catLook,
  portraitShapes,
  type ArtBreed,
  type CatLook,
  type CatPose,
  type CatShape,
  type Colour,
} from '../../src/view/art/cat-look';
import { pettingBody, pettingCat } from '../../src/view/art/cat-petting';
import { catPortrait, shapeSvg } from '../../src/view/art/illustrations';
import { box, contrast, outline, type Point } from '../helpers/cat-shapes';

// Spec 041 T-14 PR 1 (cat-looks.md 1, ui-design 6.1): a cat's look is five choices, drawn
// in layers on the breed's outline by every renderer.

const T = CAT_TOKENS;
type Item = keyof CatAppearance;
const ITEMS = Object.keys(APPEARANCE_OPTIONS) as Item[];
const PLAIN: CatAppearance = {
  colour: 'cream',
  pattern: 'solid',
  white: 'none',
  eyes: 'blue',
  face: 'round',
};
/** Every look there is: 6 colours × 3 patterns × 5 whites × 3 eyes × 3 faces. */
const EVERY = ITEMS.reduce<CatAppearance[]>(
  (looks, item) =>
    looks.flatMap((look) =>
      APPEARANCE_OPTIONS[item].map((option) => ({ ...look, [item]: option })),
    ),
  [PLAIN],
);
const look = (edit: Partial<CatAppearance> = {}, breed: ArtBreed = 'RAGDOLL') =>
  catLook(breed, { ...PLAIN, ...edit });
const HAPPY: CatPose = { face: 'happy', ears: 'up', curled: false };
const CALM: CatPose = { face: 'calm', ears: 'up', curled: false };

/** Every shape a look is drawn from: the map cat, each ear position, dozing, the petting body. */
function drawings(cat: CatLook): Record<string, readonly CatShape[]> {
  const body = pettingBody(cat);
  return {
    tail: cat.tail,
    ruff: cat.ruff,
    head: cat.head,
    earsUp: cat.ears.up,
    earsMid: cat.ears.mid,
    earsDown: cat.ears.down,
    curled: cat.curled,
    back: body.back,
    front: body.front,
  };
}
const geometry = (shape: CatShape) => JSON.stringify(shape.d ?? shape.ellipse);
/**
 * How `changed` draws differently from `plain`, if not only in `own` colours: every shape
 * of `plain` keeps its outline (it may be recoloured), and every new one is painted only
 * in `own`. Returns the differences that break this.
 */
function strayChanges(
  plain: CatLook,
  changed: CatLook,
  own: readonly Colour[],
) {
  const before = drawings(plain);
  const problems: string[] = [];
  for (const [part, shapes] of Object.entries(drawings(changed))) {
    const old = new Set(before[part]!.map((shape) => JSON.stringify(shape)));
    for (const shape of shapes)
      if (
        !old.has(JSON.stringify(shape)) &&
        [shape.fill, shape.stroke].some((key) => key && !own.includes(key))
      )
        problems.push(`${part} adds ${JSON.stringify(shape)}`);
    const kept = new Set(shapes.map(geometry));
    for (const shape of before[part]!)
      if (!kept.has(geometry(shape)))
        problems.push(`${part} loses ${geometry(shape)}`);
  }
  return problems;
}
const inside = (shapes: readonly CatShape[], [x, y]: Point) => {
  const at = box(shapes);
  return x > at.left && x < at.right && y > at.top && y < at.bottom;
};
const EYES: Point[] = [
  [29, 38],
  [43, 38],
];
const MOUTH: Point = [36, 47];
/** The head's outline: the one line drawn round it without a fill. */
const headLine = (cat: CatLook) =>
  cat.head.find((shape) => shape.stroke === 'line' && !shape.fill)!;
/** How wide the head is near the chin, where a pointed face narrows. */
const chinWidth = (cat: CatLook) => {
  const low = outline(headLine(cat)).filter(([, y]) => y >= 54);
  return Math.max(...low.map(([x]) => x)) - Math.min(...low.map(([x]) => x));
};
const painted = (shapes: readonly CatShape[], key: Colour) =>
  shapes.filter((shape) => shape.fill === key || shape.stroke === key);

describe('five choices make a cat’s look (cat-looks.md 1)', () => {
  it('offers the spec’s options for colour, pattern, white, eyes and face', () => {
    expect(APPEARANCE_OPTIONS).toEqual({
      colour: ['black', 'gray', 'orange', 'cream', 'white', 'brown'],
      pattern: ['solid', 'tabby', 'point'],
      white: ['none', 'mittens', 'bib', 'cow', 'bicolour'],
      eyes: ['blue', 'copper', 'green'],
      face: ['round', 'pointed', 'long'],
    });
    expect(EVERY).toHaveLength(6 * 3 * 5 * 3 * 3);
  });

  it('draws three breeds: the domestic cat of PR 2, the ragdoll and the shorthair', () => {
    expect(ART_BREEDS).toEqual(['DOMESTIC', ...CAT_BREED_IDS]);
  });

  it('takes the fur and its shade from the colour alone, the iris from the eyes alone', () => {
    for (const appearance of EVERY)
      for (const breed of ART_BREEDS) {
        const { colours } = catLook(breed, appearance);
        const fur = look({ colour: appearance.colour }).colours;
        const iris = look({ eyes: appearance.eyes }).colours.iris;
        expect([
          colours.coat,
          colours.shade,
          colours.line,
          colours.shadeLine,
        ]).toEqual([fur.coat, fur.shade, fur.line, fur.shadeLine]);
        expect(colours.iris).toBe(iris);
        expect([colours.white, colours.whiteLine]).toEqual([
          T.coatWhite,
          T.brown,
        ]);
      }
    const each = (item: Item, key: Colour) =>
      new Set(
        APPEARANCE_OPTIONS[item].map(
          (option) => look({ [item]: option }).colours[key],
        ),
      ).size;
    expect([each('colour', 'coat'), each('colour', 'shade')]).toEqual([6, 6]);
    expect(each('eyes', 'iris')).toBe(3);
  });

  it('changes no shape for another colour or other eyes', () => {
    for (const breed of ART_BREEDS)
      for (const appearance of EVERY) {
        const shapes = drawings(catLook(breed, appearance));
        expect(
          drawings(catLook(breed, { ...appearance, colour: 'black' })),
        ).toEqual(shapes);
        expect(
          drawings(catLook(breed, { ...appearance, eyes: 'blue' })),
        ).toEqual(shapes);
      }
  });

  it('adds only markings in the shade for a pattern', () => {
    const problems = ART_BREEDS.flatMap((breed) =>
      EVERY.filter(
        (appearance) =>
          appearance.pattern === 'solid' && appearance.eyes === 'blue',
      ).flatMap((appearance) =>
        (['tabby', 'point'] as const).flatMap((pattern) =>
          strayChanges(
            catLook(breed, appearance),
            catLook(breed, { ...appearance, pattern }),
            ['shade', 'shadeLine'],
          ),
        ),
      ),
    );
    expect(problems).toEqual([]);
  });

  it('adds only white patches for white', () => {
    const problems = ART_BREEDS.flatMap((breed) =>
      EVERY.filter(
        (appearance) =>
          appearance.white === 'none' && appearance.eyes === 'blue',
      ).flatMap((appearance) =>
        APPEARANCE_OPTIONS.white.flatMap((white) =>
          strayChanges(
            catLook(breed, appearance),
            catLook(breed, { ...appearance, white }),
            ['white', 'whiteLine'],
          ),
        ),
      ),
    );
    expect(problems).toEqual([]);
  });

  it('changes only the head and the ears for another face', () => {
    for (const breed of ART_BREEDS)
      for (const appearance of EVERY.filter(({ eyes }) => eyes === 'blue')) {
        const [round, ...others] = APPEARANCE_OPTIONS.face.map((face) =>
          drawings(catLook(breed, { ...appearance, face })),
        );
        const rest = (shapes: ReturnType<typeof drawings>) => [
          shapes.tail,
          shapes.ruff,
          shapes.curled,
          shapes.back,
          shapes.front,
        ];
        for (const other of others) {
          expect(other.head).not.toEqual(round!.head);
          expect(rest(other)).toEqual(rest(round!));
        }
      }
  });
});

describe('three faces on each breed’s outline', () => {
  const heads = (breed: ArtBreed) =>
    APPEARANCE_OPTIONS.face.map((face) => look({ face }, breed));

  it('draws a round, a pointed and a long head apart on every breed', () => {
    for (const breed of ART_BREEDS) {
      const [round, pointed, long] = heads(breed);
      expect(
        new Set([round, pointed, long].map((cat) => headLine(cat!).d)).size,
      ).toBe(3);
      const tall = (cat: CatLook) => {
        const { width, height } = box([headLine(cat)]);
        return height / width;
      };
      expect(tall(long!), breed).toBeGreaterThan(tall(round!) + 0.05);
      expect(chinWidth(pointed!), breed).toBeLessThan(chinWidth(round!) - 3);
      // The feet stay where they were: every head sits on the same line.
      for (const cat of [round, pointed, long])
        expect(box([headLine(cat!)]).bottom).toBe(58);
    }
  });

  it('keeps the ears on the head for every face', () => {
    /** Whether a point is inside a closed outline (ray casting). */
    const within = (polygon: Point[], [x, y]: Point) =>
      polygon.reduce((inside, [x1, y1], i) => {
        const [x2, y2] = polygon[(i + 1) % polygon.length]!;
        return y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1
          ? !inside
          : inside;
      }, false);
    for (const breed of ART_BREEDS)
      for (const cat of heads(breed)) {
        const head = outline(headLine(cat));
        for (const [position, ears] of Object.entries(cat.ears)) {
          // An ear is open at its base: its first and last points sit on the head.
          const ear = outline(ears[0]!);
          for (const base of [ear[0]!, ear.at(-1)!])
            expect(
              within(head, base),
              `${breed} ${cat.appearance.face} ${position}`,
            ).toBe(true);
        }
      }
  });

  it('gives the domestic cat a triangle of a face, big upright ears and a thin long tail', () => {
    const domestic = look({}, 'DOMESTIC');
    const ragdoll = look();
    const shorthair = look({}, 'BRITISH_SHORTHAIR');
    const taper = (cat: CatLook) => chinWidth(cat) / box([headLine(cat)]).width;
    expect(taper(domestic)).toBeLessThan(taper(ragdoll));
    expect(taper(domestic)).toBeLessThan(taper(shorthair));
    const [big, small] = [domestic, ragdoll].map((cat) =>
      box([cat.ears.up[0]!]),
    );
    expect(big!.width * big!.height).toBeGreaterThan(
      small!.width * small!.height,
    );
    expect(big!.top).toBeLessThan(small!.top);
    const root = { x: 58, y: 50 };
    const reach = (cat: CatLook) =>
      Math.max(
        ...cat.tail
          .flatMap(outline)
          .map(([x, y]) => Math.hypot(x - root.x, y - root.y)),
      );
    // A long thin tail fills little of its box: measure the fur itself (shoelace).
    const area = (cat: CatLook) => {
      const points = outline(cat.tail[0]!);
      return Math.abs(
        points.reduce((sum, [x1, y1], i) => {
          const [x2, y2] = points[(i + 1) % points.length]!;
          return sum + x1 * y2 - x2 * y1;
        }, 0) / 2,
      );
    };
    expect(reach(domestic)).toBeGreaterThanOrEqual(reach(ragdoll));
    expect(area(domestic)).toBeLessThan(area(ragdoll) / 2);
    expect(domestic.ruff).toEqual([]);
  });
});

describe('each pattern and white is drawn where it belongs', () => {
  it('draws a tabby’s M on the forehead, stripes on its back and rings round its tail', () => {
    for (const breed of ART_BREEDS) {
      const tabby = look({ pattern: 'tabby' }, breed);
      const [m] = painted(tabby.head, 'shade');
      const forehead = box([m!]);
      expect(forehead.bottom).toBeLessThan(38 - 3.4);
      expect(forehead.left).toBeGreaterThan(24);
      expect(forehead.right).toBeLessThan(48);
      expect(m!.d!.match(/L/g)).toHaveLength(4);
      expect(painted(tabby.tail, 'shade').length).toBeGreaterThanOrEqual(2);
      expect(painted(tabby.curled, 'shade').length).toBeGreaterThanOrEqual(2);
      expect(
        painted(pettingBody(tabby).back, 'shade').length,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('darkens a point’s mask over the eyes and mouth, its ears, tail and paws', () => {
    for (const breed of ART_BREEDS) {
      const point = look({ pattern: 'point' }, breed);
      const mask = point.head.filter((shape) => shape.fill === 'shade');
      expect(mask).toHaveLength(1);
      for (const at of [...EYES, MOUTH]) expect(inside(mask, at)).toBe(true);
      for (const ears of Object.values(point.ears))
        for (const ear of ears)
          expect(ear).toMatchObject({ fill: 'shade', stroke: 'shadeLine' });
      expect(point.tail[0]).toMatchObject({
        fill: 'shade',
        stroke: 'shadeLine',
      });
      const { back, front } = pettingBody(point);
      for (const paw of [...back, ...front].filter((shape) => shape.ellipse))
        expect(paw.fill).toBe('shade');
      // Dozing, the face and the ear still show the point.
      expect(painted(point.curled, 'shade').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('whitens the paws for mittens, the chin and chest for a bib, patches for a cow', () => {
    for (const breed of ART_BREEDS) {
      const none = look({}, breed);
      const mittens = look({ white: 'mittens' }, breed);
      expect({ ...mittens, appearance: none.appearance }).toEqual(none);
      const paws = [
        ...pettingBody(mittens).back,
        ...pettingBody(mittens).front,
      ].filter((shape) => shape.ellipse);
      expect(paws).toHaveLength(2);
      for (const paw of paws)
        expect(paw).toMatchObject({ fill: 'white', stroke: 'whiteLine' });

      const bib = look({ white: 'bib' }, breed);
      const [chin] = painted(bib.head, 'white');
      expect(box([chin!]).top).toBeGreaterThan(MOUTH[1] + 3);
      expect(painted(pettingBody(bib).back, 'white')).toHaveLength(1);

      const cow = look({ white: 'cow' }, breed);
      const patches = painted(cow.head, 'white');
      expect(patches.length).toBeGreaterThanOrEqual(1);
      for (const at of [...EYES, MOUTH])
        expect(inside(patches, at)).toBe(false);
      expect(painted(cow.curled, 'white').length).toBeGreaterThanOrEqual(1);
      expect(
        painted(pettingBody(cow).back, 'white').length,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('whitens a bicolour’s lower face, ruff, belly and paws, outlined in warm brown', () => {
    for (const breed of ART_BREEDS) {
      const bicolour = look({ colour: 'black', white: 'bicolour' }, breed);
      const lower = bicolour.head.filter((shape) => shape.fill === 'white');
      expect(lower.length).toBeGreaterThanOrEqual(1);
      expect(inside(lower, MOUTH)).toBe(true);
      // The white's edge on the outline is brown; the black's is light.
      expect(painted(bicolour.head, 'whiteLine').length).toBeGreaterThanOrEqual(
        1,
      );
      expect(headLine(bicolour).stroke).toBe('line');
      expect(bicolour.colours.line).toBe(T.paper);
      for (const tuft of bicolour.ruff)
        expect(tuft).toMatchObject({ fill: 'white', stroke: 'whiteLine' });
      expect(painted(bicolour.curled, 'white').length).toBeGreaterThanOrEqual(
        1,
      );
      const { back, front } = pettingBody(bicolour);
      expect(painted(back, 'white').length).toBeGreaterThanOrEqual(2);
      expect(front[0]).toMatchObject({ fill: 'white' });
    }
  });

  it('keeps a bicolour’s white below the eyes, so the eyes sit on the fur', () => {
    const eyeBottom = 38 + 3.4;
    const underEyes = ([x]: Point) =>
      (x >= 25 && x <= 33) || (x >= 39 && x <= 47);
    for (const breed of ART_BREEDS)
      for (const face of APPEARANCE_OPTIONS.face) {
        const cat = look({ white: 'bicolour', face }, breed);
        const under = cat.head.find((shape) => shape.fill === 'white');
        for (const [, y] of outline(under!).filter(underEyes))
          expect(y).toBeGreaterThan(eyeBottom);
      }
  });

  it('shows the eye colour in a calm cat’s eyes, round a dark pupil', () => {
    for (const eyes of APPEARANCE_OPTIONS.eyes) {
      const cat = look({ eyes });
      const markup = catPortrait(cat, CALM);
      expect(markup).toContain(`fill="${cat.colours.iris}"`);
      expect(markup).toContain(`fill="${T.ink}"`);
    }
  });
});

describe('colours a line can be seen against (ui-design 2.2)', () => {
  it('outlines each fur, shade and white at 3:1 or more; black and brown fur in a light line', () => {
    for (const colour of APPEARANCE_OPTIONS.colour) {
      const { colours } = look({ colour });
      expect(
        contrast(colours.coat, colours.line),
        colour,
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(colours.shade, colours.shadeLine),
        colour,
      ).toBeGreaterThanOrEqual(3);
      expect(contrast(colours.white, colours.whiteLine)).toBeGreaterThanOrEqual(
        3,
      );
    }
    expect(look({ colour: 'black' }).colours.line).toBe(T.paper);
    expect(look({ colour: 'brown' }).colours.line).toBe(T.paper);
    for (const colour of ['gray', 'orange', 'cream', 'white'] as const)
      expect(look({ colour }).colours.line).toBe(T.brown);
  });

  it('draws the eyes and the mouth to be seen on what lies under them, in every look', () => {
    for (const appearance of EVERY) {
      const { colours } = catLook('RAGDOLL', appearance);
      // A point's mask covers eyes and mouth; a bicolour's white lies under the mouth.
      const face =
        appearance.pattern === 'point' ? colours.shade : colours.coat;
      const mouth = appearance.white === 'bicolour' ? colours.white : face;
      expect(
        contrast(colours.eye, face),
        JSON.stringify(appearance),
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(colours.mouth, mouth),
        JSON.stringify(appearance),
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('T-13’s four coats as five choices (the drawing stays)', () => {
  /** T-13's drawings of a cream cat, captured before the five choices (commit 7a800d2). */
  const T13 = JSON.parse(
    readFileSync('tests/fixtures/cat-art-t13.json', 'utf8'),
  ) as Record<CatBreed, Record<string, string>>;
  const T13_FUR = {
    cream: '#f7e3c4',
    gray: '#cbd2d1',
    orange: '#ffc681',
  } as const;

  it('maps each coat to its five choices', () => {
    expect(Object.keys(COAT_APPEARANCE)).toEqual([...CAT_COATS]);
    expect(COAT_APPEARANCE).toMatchObject({
      cream: {
        colour: 'cream',
        pattern: 'solid',
        white: 'none',
        face: 'round',
      },
      gray: { colour: 'gray', pattern: 'solid', white: 'none', face: 'round' },
      orange: {
        colour: 'orange',
        pattern: 'solid',
        white: 'none',
        face: 'round',
      },
      tuxedo: {
        colour: 'black',
        pattern: 'solid',
        white: 'bicolour',
        face: 'round',
      },
    });
  });

  it('draws a cream, gray or orange cat exactly as T-13 did, but for the calm eyes', () => {
    const glum: CatPose = { face: 'glum', ears: 'mid', curled: false };
    const low: CatPose = { face: 'low', ears: 'down', curled: false };
    for (const coat of ['cream', 'gray', 'orange'] as const)
      for (const breed of CAT_BREED_IDS) {
        const cat = catLook(breed, COAT_APPEARANCE[coat]);
        const expected = Object.fromEntries(
          Object.entries(T13[breed]).map(([name, markup]) => [
            name,
            markup.replaceAll(T13_FUR.cream, T13_FUR[coat]),
          ]),
        );
        expect({
          'portrait/happy-up': catPortrait(cat, HAPPY),
          'portrait/glum-mid': catPortrait(cat, glum),
          'portrait/low-down': catPortrait(cat, low),
          'portrait/curled': catPortrait(cat, { ...CALM, curled: true }),
          'figure/happy-up': [...cat.tail, ...portraitShapes(cat, HAPPY)]
            .map((shape) => shapeSvg(shape, cat.colours))
            .join(''),
          'petting/happy-up': pettingCat(cat, HAPPY),
        }).toEqual(expected);
      }
  });

  it('draws the tuxedo’s lower face as T-13 did, with a light outline on its black', () => {
    const UNDER = {
      RAGDOLL:
        'M12 40C16 46 26 47 30 44C33 42 35 40 36 40C37 40 39 42 42 44C46 47 56 46 60 40C60 54 50 58 36 58C22 58 12 54 12 40Z',
      BRITISH_SHORTHAIR:
        'M10 41C15 47 26 47 30 44C33 42 35 40 36 40C37 40 39 42 42 44C46 47 57 47 62 41C62 54 51 58 36 58C21 58 10 54 10 41Z',
    };
    for (const breed of CAT_BREED_IDS) {
      const tuxedo = catLook(breed, COAT_APPEARANCE.tuxedo);
      expect(tuxedo.head).toContainEqual({ d: UNDER[breed], fill: 'white' });
      expect(tuxedo.colours).toMatchObject({
        coat: T.coatBlack,
        white: T.coatWhite,
        line: T.paper,
        whiteLine: T.brown,
        eye: T.paper,
        mouth: T.brown,
      });
    }
  });
});
