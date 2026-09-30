import { describe, expect, it } from 'vitest';
import { createWorld, type World } from '../../src/core';
import { finishFishing, fishingFixture } from '../unit/fishing-fixture';
import { openCats } from '../helpers/view-player';
import {
  $,
  choose,
  click,
  key,
  openGame,
  pressEnter,
  text,
} from '../helpers/view-rig';
import { invite } from '../helpers/world';

// Spec 041 R-16 (ui-design 5.4 "改名", 7, 8): renaming a cat from its detail.

const save = (world: World) => ({ 'cat-city.save.v1': world.save() });
/** Mochi and Pepper. */
const pair = () => {
  const world = createWorld(42);
  invite(world);
  return world;
};
const chips = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>('#name-dialog [role="radio"]'),
  );
const checked = () =>
  chips().map((chip) => chip.getAttribute('aria-checked') === 'true');
const field = () => $<HTMLInputElement>('#name-input');
/** Mochi's detail, and the box its pencil opens. */
function renameMochi(storage = save(pair())) {
  const game = openGame({ storage });
  openCats();
  click('[data-cat-details="mochi"]');
  click('#profile-rename');
  return game;
}

describe('renaming a cat from its detail (R-16)', () => {
  it('the pencil beside the name opens the box on the cat’s name', () => {
    renameMochi();
    expect($('#profile-rename').getAttribute('aria-label')).toBe(
      '给 Mochi 改名字',
    );
    expect(text('#name-title')).toBe('给 Mochi 改个名字');
    expect(text('#name-confirm')).toBe('就叫这个');
    expect(field().value).toBe('Mochi');
    expect(checked()).not.toContain(true);
    expect(text('#name-note')).toBe('');
  });

  it('confirms a suggestion: the roster, the detail and the card say the new name', () => {
    const game = renameMochi();
    const chip = chips()[1]!;
    const name = chip.textContent;
    click('#name-dialog [role="radio"]:nth-child(2)');
    click('#name-confirm');
    expect(game.world().cats[0]!.name).toBe(name);
    expect(game.session.lastCommand()!.command).toEqual({
      type: 'RENAME_CAT',
      catId: 'mochi',
      name,
    });
    expect(text('#profile-name')).toContain(name);
    expect(text('#notice')).toBe(`以后它就叫 ${name} 了。`);
    // Back to where it was opened from.
    expect(document.activeElement).toBe($('#profile-rename'));
    click('#profile-back');
    expect(text('[data-cat-id="mochi"] strong')).toBe(name);
    expect(text('#cat-name')).toBe(name);
  });

  it('warns of a namesake and still renames', () => {
    const game = renameMochi();
    choose('#name-input', ' Pepper ');
    expect(text('#name-note')).toBe('城里已经有一只Pepper了');
    click('#name-confirm');
    expect(game.world().cats.map((cat) => cat.name)).toEqual([
      'Pepper',
      'Pepper',
    ]);
  });

  it('sends nothing when the name stays the same or the box is cancelled', () => {
    const game = renameMochi();
    click('#name-confirm');
    expect(document.querySelector('#name-dialog')).toBeNull();
    click('#profile-rename');
    choose('#name-input', '团子');
    click('#name-cancel');
    expect(game.session.lastCommand()).toBeNull();
    expect(game.world().cats[0]!.name).toBe('Mochi');
  });

  it('goes through with the keyboard alone', () => {
    const game = openGame({ storage: save(pair()) });
    pressEnter('#city-tab-cats');
    pressEnter('[data-cat-details="mochi"]');
    pressEnter('#profile-rename');
    // Tab goes round: the field, the six suggestions, "换一批", cancel, confirm.
    const stops = [
      field(),
      ...chips(),
      $('#name-more'),
      $('#name-cancel'),
      $('#name-confirm'),
    ];
    for (const stop of stops) {
      key('keydown', 'Tab');
      expect(document.activeElement).toBe(stop);
    }
    key('keydown', 'Tab');
    expect(document.activeElement).toBe(field());
    key('keydown', 'Tab', true);
    expect(document.activeElement).toBe($('#name-confirm'));
    // Arrows move among the suggestions; Enter picks one.
    chips()[0]!.focus();
    key('keydown', 'ArrowLeft');
    expect(document.activeElement).toBe(chips()[5]);
    key('keydown', 'ArrowRight');
    key('keydown', 'ArrowRight');
    expect(document.activeElement).toBe(chips()[1]);
    const picked = chips()[1]!.textContent;
    key('keydown', 'Enter');
    expect(field().value).toBe(picked);
    $('#name-confirm').focus();
    key('keydown', 'Enter');
    expect(game.world().cats[0]!.name).toBe(picked);
    expect(document.querySelector('#name-dialog')).toBeNull();
    expect(document.activeElement).toBe($('#profile-rename'));
  });

  it('the recollection speaks of the new name', () => {
    const world = fishingFixture(42);
    world.dispatch({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'BREAD',
      direction: -30,
      spotId: 'POND',
      aimDepth: 50,
    });
    finishFishing(world);
    renameMochi(save(world));
    choose('#name-input', '<b>小黑</b>');
    click('#name-confirm');
    expect(text('#memory-fact')).toContain('第一次和 <b>小黑</b> 钓到');
    expect(document.querySelectorAll('#memory-fact b')).toHaveLength(0);
    expect(document.querySelectorAll('#profile-name b')).toHaveLength(0);
  });
});
