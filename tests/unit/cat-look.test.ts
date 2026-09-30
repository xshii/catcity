import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAT_BREED_IDS, type CatBreed } from '../../src/content/breeds';
import type { WorldState } from '../../src/core';
import { createWorld, loadWorld } from '../../src/core/world';
import { invite } from '../helpers/world';
import { MOOD_COPY } from '../../src/view/common/mood';
import {
  CAT_TOKENS,
  catLook,
  catPose,
  lookOf,
  portraitShapes,
  type CatEars,
  type CatLook,
  type CatPose,
  type CatShape,
} from '../../src/view/art/cat-look';
import { catPortrait, shapeSvg } from '../../src/view/art/illustrations';
import {
  box,
  contrast,
  outline,
  T13_BREEDS,
  T13_COATS,
  type Point,
} from '../helpers/cat-shapes';
import { finishFishing, fishingFixture } from './fishing-fixture';

/** A cat's look as T-13 had it: a breed and a coat. */
const coated = (breed: CatBreed, coat: keyof typeof T13_COATS) =>
  catLook(breed, T13_COATS[coat]);
const MOCHI = coated('RAGDOLL', 'cream');

type Cat = WorldState['cats'][number];
const withCat = (edit: (cat: Cat) => void): WorldState => {
  const world = createWorld(42).getSnapshot();
  edit(world.cats[0]!);
  return world;
};
const poseOf = (world: WorldState) => catPose(world, world.cats[0]!);
const rested = (mood: number) =>
  poseOf(
    withCat((cat) => {
      cat.mood = mood;
      cat.needs.energy = 100;
    }),
  );
const tired = (edit: (cat: Cat) => void = () => {}) =>
  poseOf(
    withCat((cat) => {
      cat.needs.energy = 40;
      edit(cat);
    }),
  );
const walk = (nextStepMinute: number | null): Cat['walk'] => ({
  destination: { x: 0, y: 0 },
  route: [{ x: 0, y: 0 }],
  nextStepMinute,
  spotId: null,
});

describe('a cat’s pose (style board 猫咪表情)', () => {
  it('takes face and ears from every mood band, awake at full energy', () => {
    expect([100, 80, 79, 50, 49, 30, 29, 0].map(rested)).toEqual([
      ...[100, 80].map(() => ({ face: 'happy', ears: 'up', curled: false })),
      ...[79, 50].map(() => ({ face: 'calm', ears: 'up', curled: false })),
      ...[49, 30].map(() => ({ face: 'glum', ears: 'mid', curled: false })),
      ...[29, 0].map(() => ({ face: 'low', ears: 'down', curled: false })),
    ]);
  });

  it('curls up an idle cat that is recovering energy, keeping its mood', () => {
    expect(tired((cat) => (cat.mood = 90))).toEqual({
      face: 'happy',
      ears: 'up',
      curled: true,
    });
    expect(tired((cat) => (cat.mood = 10)).curled).toBe(true);
  });

  it('keeps a walking cat up, but curls one whose walk stopped for rest', () => {
    expect(tired((cat) => (cat.walk = walk(5))).curled).toBe(false);
    // Core counts a walk stopped by exhaustion as idle: the cat dozes until it can go on.
    expect(tired((cat) => (cat.walk = walk(null))).curled).toBe(true);
  });

  it('keeps a cat holding a run up, and curls it once the run is put away', () => {
    const fixture = JSON.parse(fishingFixture(42).save());
    fixture.world.cats[0].needs.energy = 40;
    const game = loadWorld(JSON.stringify(fixture));
    const begun = game.dispatch({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      spotId: 'POND',
      baitId: 'BREAD',
      direction: 0,
      aimDepth: 50,
    });
    expect(begun.ok).toBe(true);
    expect(poseOf(game.getSnapshot()).curled).toBe(false);
    game.dispatch({
      type: 'FISH_CANCEL',
      runId: game.getSnapshot().fishing.active!.id,
    });
    expect(poseOf(game.getSnapshot()).curled).toBe(true);
  });
});

describe('the cat fishing with the player stays awake at the river (R-01)', () => {
  const at = (world: WorldState, atRiver: boolean) =>
    catPose(world, world.cats[0]!, { atRiver });
  const idleAt = (energy: number) =>
    withCat((cat) => {
      cat.mood = 60;
      cat.needs.energy = energy;
    });

  it('sits up between casts though it is recovering, its face still its mood', () => {
    const world = idleAt(50);
    expect(world.fishing.active).toBeNull();
    expect(at(world, true)).toEqual({ ...at(world, false), curled: false });
  });

  it('sits up while the catch just made is shown', () => {
    const game = fishingFixture(42);
    game.dispatch({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      spotId: 'POND',
      baitId: 'BREAD',
      direction: 0,
      aimDepth: 50,
    });
    finishFishing(game);
    const world = game.getSnapshot();
    expect(world.fishing.lastResult?.catId).toBe('mochi');
    // The same idle, tired cat would doze in the city.
    expect(at(world, false).curled).toBe(true);
    expect(at(world, true).curled).toBe(false);
  });

  it('keeps an idle cat in the city dozing while it recovers, and up once rested', () => {
    expect(at(idleAt(50), false).curled).toBe(true);
    expect(at(idleAt(100), false).curled).toBe(false);
  });
});

describe('the card portrait draws the pose', () => {
  const faces = Object.keys(MOOD_COPY.bands) as CatPose['face'][];
  const awake = (face: CatPose['face'], ears: CatPose['ears'] = 'up') =>
    catPortrait(MOCHI, { face, ears, curled: false });
  const curled = (face: CatPose['face']) =>
    catPortrait(MOCHI, { face, ears: 'up', curled: true });

  it('draws each face and each ear position differently', () => {
    expect(new Set(faces.map((face) => awake(face))).size).toBe(4);
    expect(
      new Set((['up', 'mid', 'down'] as const).map((e) => awake('calm', e)))
        .size,
    ).toBe(3);
  });

  it('draws one dozing ball whatever the mood, unlike any awake face', () => {
    expect(new Set(faces.map(curled)).size).toBe(1);
    for (const face of faces) expect(awake(face)).not.toBe(curled(face));
  });

  it('blushes when happy or calm (sakura) and sheds a tear when low', () => {
    expect(awake('happy')).toContain('#f2b8b5');
    expect(awake('calm')).toContain('#f7cfc8');
    expect(awake('glum')).not.toMatch(/#f2b8b5|#f7cfc8/);
    expect(awake('low')).toContain('#9ccfc8');
  });

  it('colours the fur by coat, outlines in warm brown and stays decorative', () => {
    const pose: CatPose = { face: 'calm', ears: 'up', curled: false };
    expect(catPortrait(MOCHI, pose)).toContain('fill="#f7e3c4"');
    expect(catPortrait(coated('RAGDOLL', 'gray'), pose)).not.toContain(
      'fill="#f7e3c4"',
    );
    for (const markup of [...faces.map((face) => awake(face)), curled('low')]) {
      expect(markup).toContain('stroke="#8a6f5a"');
      // Square like before, so card layouts keep their size; words live beside it.
      expect(markup).toMatch(/^<svg viewBox="4 0 64 64" aria-hidden="true">/);
    }
  });
});

describe('each breed has its own outline (ui-design 6.1, R-15)', () => {
  const art = (breed: CatBreed) => coated(breed, 'cream');
  const ragdoll = art('RAGDOLL');
  const shorthair = art('BRITISH_SHORTHAIR');
  const colours = (markup: string) => new Set(markup.match(/#[0-9a-f]{6}/g));

  it('tells the breeds apart awake and dozing, by shape and not by colour', () => {
    for (const curled of [false, true]) {
      const pose: CatPose = { face: 'calm', ears: 'up', curled };
      const [first, second] = CAT_BREED_IDS.map((breed) =>
        catPortrait(art(breed), pose),
      );
      expect(first).not.toBe(second);
      expect(colours(first!)).toEqual(colours(second!));
    }
  });

  it('gives a shorthair a rounder face than a ragdoll: wider for its height', () => {
    const round = (breed: CatBreed) => {
      const face = box(art(breed).head);
      return face.width / face.height;
    };
    expect(round('BRITISH_SHORTHAIR')).toBeGreaterThan(round('RAGDOLL'));
  });

  it('gives a shorthair smaller ears, whose tips stay lower, in every ear position', () => {
    for (const ears of ['up', 'mid', 'down'] satisfies CatEars[]) {
      const [big, small] = [ragdoll, shorthair].map(({ ears: shapes }) =>
        box([shapes[ears][0]!]),
      );
      expect(small!.width * small!.height).toBeLessThan(
        big!.width * big!.height,
      );
      expect(small!.top).toBeGreaterThan(big!.top);
    }
  });

  it('fluffs a ragdoll’s cheeks out past its face; a shorthair has no ruff', () => {
    const face = box(ragdoll.head);
    const ruff = box(ragdoll.ruff);
    expect(ruff.left).toBeLessThan(face.left);
    expect(ruff.right).toBeGreaterThan(face.right);
    // The ruff is at the cheeks, below the eyes.
    expect(ruff.top).toBeGreaterThan(38);
    expect(shorthair.ruff).toEqual([]);
  });

  it('gives a ragdoll a big plume of a tail and a shorthair a short one', () => {
    const root = { x: 58, y: 50 };
    const reach = (shapes: readonly CatShape[]) =>
      Math.max(
        ...shapes
          .flatMap(outline)
          .map(([x, y]) => Math.hypot(x - root.x, y - root.y)),
      );
    const area = (shapes: readonly CatShape[]) => {
      const { width, height } = box(shapes);
      return width * height;
    };
    expect(reach(shorthair.tail)).toBeLessThan(reach(ragdoll.tail) * 0.7);
    expect(area(shorthair.tail)).toBeLessThan(area(ragdoll.tail) / 2);
  });

  it('draws a portrait as the map cat without its tail: the breed’s ruff, face and ears', () => {
    for (const breed of CAT_BREED_IDS) {
      const pose: CatPose = { face: 'happy', ears: 'mid', curled: false };
      const shapes = portraitShapes(art(breed), pose);
      expect(shapes).toEqual(
        expect.arrayContaining([
          ...art(breed).ruff,
          ...art(breed).head,
          ...art(breed).ears.mid,
        ]),
      );
      expect(shapes).not.toEqual(expect.arrayContaining([...art(breed).tail]));
      expect(portraitShapes(art(breed), { ...pose, curled: true })).toBe(
        art(breed).curled,
      );
    }
  });

  it('reads a cat’s look from its coat and its breed', () => {
    const world = createWorld(42);
    invite(world);
    const [mochi, pepper] = world.getSnapshot().cats;
    expect(lookOf(mochi!)).toBe(MOCHI);
    expect(lookOf(pepper!)).toBe(coated('BRITISH_SHORTHAIR', 'gray'));
  });
});

describe('four coats in the colours of tokens.css (ui-design 2.2, 6.1)', () => {
  const T = CAT_TOKENS;
  const FUR = {
    cream: T.coatCream,
    gray: T.coatGray,
    orange: T.coatOrange,
    tuxedo: T.coatBlack,
  };
  const awake: CatPose = { face: 'calm', ears: 'up', curled: false };
  const coats = Object.keys(T13_COATS) as (keyof typeof T13_COATS)[];
  const looks = coats.flatMap((coat) =>
    T13_BREEDS.map((breed) => ({ coat, look: coated(breed, coat) })),
  );
  /** The cat on the map: its tail behind the portrait's shapes. */
  const figure = (look: CatLook, pose: CatPose) =>
    [...look.tail, ...portraitShapes(look, pose)]
      .map((shape) => shapeSvg(shape, look.colours))
      .join('');

  it('mirrors the values of the CSS tokens of the same name', () => {
    const css = readFileSync('src/view/styles/tokens.css', 'utf8');
    for (const [name, colour] of Object.entries(CAT_TOKENS)) {
      const token = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      expect(css).toContain(`--${token}: ${colour};`);
    }
  });

  it('keeps every light fur at 3:1 or more against the warm-brown outline (WCAG)', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21);
    // The tuxedo's dark fur is the exception: its eyes and outline are paper there.
    for (const fur of [T.coatCream, T.coatGray, T.coatOrange, T.coatWhite])
      expect(contrast(fur, T.brown), fur).toBeGreaterThanOrEqual(3);
  });

  it('has a colour for every coat a cat can wear', () => {
    expect(Object.keys(FUR)).toEqual(coats);
  });

  it('draws each of the 4 coats × 2 breeds apart, in the roster and on the map', () => {
    for (const pose of [awake, { ...awake, curled: true }]) {
      expect(
        new Set(looks.map(({ look }) => catPortrait(look, pose))).size,
      ).toBe(8);
      expect(new Set(looks.map(({ look }) => figure(look, pose))).size).toBe(8);
    }
  });

  it('fills a solid coat with its own colour only, eyes in ink and lines in warm brown', () => {
    for (const { coat, look } of looks.filter(({ coat }) => coat !== 'tuxedo'))
      for (const markup of [
        catPortrait(look, awake),
        catPortrait(look, { ...awake, curled: true }),
        figure(look, awake),
      ]) {
        expect(markup).toContain(`fill="${FUR[coat]}"`);
        for (const other of [...Object.values(FUR), T.coatWhite])
          if (other !== FUR[coat]) expect(markup).not.toContain(other);
        expect(markup).toContain(T.ink);
        expect(markup).toContain(`stroke="${T.brown}"`);
      }
  });

  // T-14 (cat-looks.md 1): dark fur takes a light outline; the white keeps the brown one.
  it('draws a tuxedo dark with a light lower face, paper eyes and outline on the dark, brown round the white', () => {
    const happy: CatPose = { ...awake, face: 'happy' };
    for (const breed of CAT_BREED_IDS) {
      const look = coated(breed, 'tuxedo');
      for (const markup of [
        catPortrait(look, happy),
        catPortrait(look, { ...awake, curled: true }),
        figure(look, happy),
      ]) {
        expect(markup).toContain(`fill="${T.coatBlack}"`);
        expect(markup).toContain(`fill="${T.coatWhite}"`);
        expect(markup).toContain(`stroke="${T.brown}"`);
        expect(markup).toContain(`stroke="${T.paper}"`);
        expect(markup).not.toContain(T.ink);
      }
      // Open eyes: a paper rim round the eye colour; only the pupils are dark.
      expect(catPortrait(look, awake)).toContain(`stroke="${T.paper}"`);
    }
  });

  it('keeps the light underside below the eyes, so paper eyes sit on dark fur', () => {
    const eyeBottom = 38 + 3.4;
    const underEyes = ([x]: Point) =>
      (x >= 25 && x <= 33) || (x >= 39 && x <= 47);
    for (const breed of CAT_BREED_IDS) {
      const look = coated(breed, 'tuxedo');
      const ruff = new Set<CatShape>(look.ruff);
      // The face's underside; a ragdoll's ruff is light fur too, out at the cheeks.
      const under = portraitShapes(look, awake).filter(
        (shape) => shape.fill === 'white' && !ruff.has(shape),
      );
      expect(under).toHaveLength(1);
      for (const [, y] of outline(under[0]!).filter(underEyes))
        expect(y).toBeGreaterThan(eyeBottom);
    }
  });
});
