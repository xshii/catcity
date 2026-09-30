import { describe, expect, it } from 'vitest';
import {
  catMakerScreen,
  choose,
  randomChoice,
  type CatChoice,
} from '../../src/view/cats/cat-maker-screen';

// Spec 041 T-14 PR 1b: the cat maker's pure model; the screen itself is in tests/view.

const START: CatChoice = {
  breed: 'DOMESTIC',
  appearance: {
    colour: 'cream',
    pattern: 'solid',
    white: 'none',
    eyes: 'blue',
    face: 'round',
  },
};

describe('the cat maker’s choices', () => {
  it('draws the first option at 0 and the last just under 1, one number per row', () => {
    let calls = 0;
    const low = randomChoice(START, true, () => (calls++, 0));
    expect(calls).toBe(6);
    expect(low).toEqual({
      breed: 'DOMESTIC',
      appearance: {
        colour: 'black',
        pattern: 'solid',
        white: 'none',
        eyes: 'blue',
        face: 'round',
      },
    });
    expect(randomChoice(START, true, () => 0.999999)).toEqual({
      breed: 'BRITISH_SHORTHAIR',
      appearance: {
        colour: 'brown',
        pattern: 'point',
        white: 'bicolour',
        eyes: 'green',
        face: 'long',
      },
    });
    calls = 0;
    expect(randomChoice(START, false, () => (calls++, 0.999999)).breed).toBe(
      'DOMESTIC',
    );
    expect(calls).toBe(5);
  });

  it('picks only an option the row has, and leaves the start as it was', () => {
    const start = structuredClone(START);
    expect(choose(START, 'colour', 'purple')).toBe(START);
    expect(choose(START, 'breed', 'SPHYNX')).toBe(START);
    expect(choose(START, 'eyes', 'copper').appearance.eyes).toBe('copper');
    expect(START).toEqual(start);
  });

  it('marks one option in each row, the breed’s only when it may be picked', () => {
    for (const pickBreed of [true, false]) {
      const { rows, look } = catMakerScreen(pickBreed, START);
      expect(rows[0]!.item).toBe(pickBreed ? 'breed' : 'colour');
      for (const row of rows)
        expect(row.options.filter((option) => option.checked)).toHaveLength(1);
      expect(look.breed).toBe('DOMESTIC');
    }
  });
});
