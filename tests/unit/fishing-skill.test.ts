import { describe, expect, it } from 'vitest';
import { fishingFixture, finishFishing } from './fishing-fixture';
import { World } from '../../src/core/world';
import {
  catchXp,
  FISHING,
  fishById,
  skillLevel,
  skillXp,
  SPOTS,
  spotUnlocked,
} from '../../src/content/fishing';
import { MOOD } from '../../src/content/mood';

const { maxLevel } = FISHING.skill;
const levels = Array.from({ length: maxLevel }, (_, index) => index + 1);

describe('fishing skill curve (spec 038)', () => {
  it('costs 31 × (n − 1) × n × (n + 1) / 3 XP in total to reach level n', () => {
    expect(levels.map(skillXp)).toEqual([
      0, 62, 248, 620, 1240, 2170, 3472, 5208, 7440, 10230,
    ]);
  });

  it('reaches each level exactly at its total and stays at the top one', () => {
    for (const level of levels) {
      expect(skillLevel(skillXp(level))).toBe(level);
      if (level > 1) expect(skillLevel(skillXp(level) - 1)).toBe(level - 1);
    }
    expect(skillLevel(0)).toBe(1);
    expect(skillLevel(skillXp(maxLevel) * 10)).toBe(maxLevel);
  });

  it('costs more for every next level', () => {
    for (const level of levels.slice(2))
      expect(skillXp(level) - skillXp(level - 1)).toBeGreaterThan(
        skillXp(level - 1) - skillXp(level - 2),
      );
  });

  it('opens the moon lake at level 5, last of the waterways', () => {
    expect(SPOTS.MOON.level).toBe(5);
    const { species } = SPOTS.MOON;
    expect(spotUnlocked('MOON', skillXp(5) - 1, species)).toBe(false);
    expect(spotUnlocked('MOON', skillXp(5), species)).toBe(true);
    expect(spotUnlocked('MOON', skillXp(5), species - 1)).toBe(false);
  });
});

describe('experience for a catch', () => {
  it('is unchanged for a calm cat and half as much again, rounded down, for a happy one', () => {
    for (const stars of [0, 1, 2, 3, 4, 5]) {
      const plain = FISHING.skill.baseXp + stars * FISHING.skill.xpPerStar;
      expect(catchXp(stars, false)).toBe(plain);
      expect(catchXp(stars, true)).toBe(Math.floor(plain * 1.5));
    }
    // 15 × 1.5 = 22.5 rounds down.
    expect(catchXp(1, true)).toBe(22);
  });

  it.each([
    ['happy', MOOD.happy, true],
    ['calm', MOOD.happy - 1, false],
  ] as const)('a %s cat earns it from the run it began', (_, mood, happy) => {
    const state = fishingFixture(42).getSnapshot();
    state.cats[0]!.mood = mood;
    const world = new World(state);
    world.dispatch({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      spotId: 'POND',
      baitId: 'BREAD',
      direction: -30,
      aimDepth: 50,
    });
    expect(world.getSnapshot().fishing.active!.happy).toBe(happy);
    finishFishing(world);
    const { xp, lastResult } = world.getSnapshot().fishing;
    expect(xp).toBe(catchXp(fishById(lastResult!.speciesId!).stars, happy));
  });
});
