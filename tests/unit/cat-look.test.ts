import { describe, expect, it } from 'vitest';
import type { WorldState } from '../../src/core';
import { createWorld, loadWorld } from '../../src/core/world';
import { MOOD_COPY } from '../../src/view/shell/mood';
import { catPose, type CatPose } from '../../src/view/art/cat-look';
import { catPortrait } from '../../src/view/art/illustrations';
import { finishFishing, fishingFixture } from './fishing-fixture';

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
    catPortrait('cream', { face, ears, curled: false });
  const curled = (face: CatPose['face']) =>
    catPortrait('cream', { face, ears: 'up', curled: true });

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
    expect(catPortrait('cream', pose)).toContain('fill="#f7e3c4"');
    expect(catPortrait('gray', pose)).not.toContain('fill="#f7e3c4"');
    for (const markup of [...faces.map((face) => awake(face)), curled('low')]) {
      expect(markup).toContain('stroke="#8a6f5a"');
      // Square like before, so card layouts keep their size; words live beside it.
      expect(markup).toMatch(/^<svg viewBox="4 0 64 64" aria-hidden="true">/);
    }
  });
});
