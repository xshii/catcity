import { expect, it } from 'vitest';
import { createPlace } from '../../src/view/shell/place';

it('a minigame is on at the river or while the petting screen is open, over either place (041 R-22)', () => {
  const place = createPlace();
  const turns: boolean[] = [];
  place.onMinigame((on) => turns.push(on));
  expect(place.minigame()).toBe(false);
  place.setPetting(true);
  expect([place.get(), place.minigame()]).toEqual(['city', true]);
  place.set('river');
  place.setPetting(false);
  expect(place.minigame()).toBe(true);
  place.set('city');
  expect(place.minigame()).toBe(false);
  place.setPetting(false);
  // Listeners hear each turn once, and nothing when the flag stays as it was.
  expect(turns).toEqual([true, false]);
});

it('tells who follows the petting screen when it opens or closes, over either place', () => {
  const place = createPlace();
  const heard: boolean[] = [];
  place.onPetting((open) => heard.push(open));
  place.set('river');
  place.setPetting(true);
  expect([place.get(), heard]).toEqual(['river', [true]]);
  place.setPetting(true);
  place.setPetting(false);
  // Each change once, whether or not it turned the minigame flag.
  expect(heard).toEqual([true, false]);
});
