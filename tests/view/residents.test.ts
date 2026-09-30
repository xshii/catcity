import { expect, it } from 'vitest';
import { ARRIVAL_MINUTES } from '../../src/content/residents';
import { residentIdentity } from '../../src/core';
import { $, click, openGame, text } from '../helpers/view-rig';

// Spec 041 T-30 (ui-design 5.7): tapping a lodge shows who lives there.

it('the lodge card counts its residents and names them as they move in, keeping its button', () => {
  const game = openGame();
  // The guide picks the plot it recommends; the lodge goes up there.
  click('#city-tab-guide');
  click('#city-action');
  click('#build-cat_lodge');
  expect(text('#city-selection-label')).toBe('居民楼');
  expect(text('#city-action-detail')).toBe('居民 0/4 · 下一位居民明天搬来');
  const move = $('#move-building');
  const names = () =>
    game
      .world()
      .residents.map(({ id }) => residentIdentity(game.world().seed, id).name)
      .join('、');
  /** Game minutes until `days` more day starts have passed. */
  const days = (count: number) =>
    count * ARRIVAL_MINUTES - (game.world().minute % ARRIVAL_MINUTES);

  expect(
    game.session.execute({ type: 'ADVANCE_TIME', minutes: days(1) }).ok,
  ).toBe(true);
  expect(game.world().residents).toHaveLength(1);
  expect(text('#city-action-detail')).toBe(
    `居民 1/4 · ${names()} · 下一位居民明天搬来`,
  );
  expect(
    game.session.execute({ type: 'ADVANCE_TIME', minutes: days(3) }).ok,
  ).toBe(true);
  expect(game.world().residents).toHaveLength(4);
  expect(text('#city-action-detail')).toBe(`居民 4/4 · ${names()}`);
  // The clock moved the card's text on; its button is the same element.
  expect($('#move-building')).toBe(move);
  expect(move.isConnected).toBe(true);
});
