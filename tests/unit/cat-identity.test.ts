import { describe, expect, it } from 'vitest';
import { KITTEN_MINUTES } from '../../src/content/family';
import { createWorld } from '../../src/core';
import { catStage } from '../../src/core/cats';

describe('catStage (spec 041 R-36)', () => {
  const world = { ...createWorld(42).getSnapshot(), minute: 10_000 };
  const mochi = world.cats[0]!;

  it('keeps a first-generation cat an adult at any time', () => {
    expect(mochi.bornMinute).toBeNull();
    expect(catStage(world, mochi)).toBe('adult');
    expect(catStage({ ...world, minute: 0 }, mochi)).toBe('adult');
  });

  it.each([
    [0, 'kitten'],
    [KITTEN_MINUTES - 1, 'kitten'],
    [KITTEN_MINUTES, 'adult'],
    [KITTEN_MINUTES + 1, 'adult'],
  ])('a cat born %i minutes ago is %s', (age, stage) => {
    const born = { ...mochi, bornMinute: world.minute - age };
    expect(catStage(world, born)).toBe(stage);
  });
});
