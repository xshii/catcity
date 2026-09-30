import { describe, expect, it } from 'vitest';
import { buildingPrice, RESTYLE_PRICE } from '../../src/content/city';
import { createWorld, World } from '../../src/core/world';
import type { WorldState } from '../../src/core';
import { salonMaker } from '../../src/view/cats/salon-screen';
import { rosterScreen } from '../../src/view/cats/screen';
import { openCats } from '../helpers/view-player';
import {
  $,
  click,
  key,
  openGame,
  pressEnter,
  text,
  visible,
} from '../helpers/view-rig';
import { invite } from '../helpers/world';

// Spec 041 T-15 (cat-looks.md 3 and 4, ui-design 7 and 8): the cat salon, from its card
// on the map to the cat maker and back.

const SAVE_KEY = 'cat-city.save.v1';
/** A new game with coins for a salon, and Pepper for a second companion. */
function saved(coins = 5000) {
  const world = new World({ ...createWorld(42).getSnapshot(), coins: 10_000 });
  invite(world);
  return { [SAVE_KEY]: new World({ ...world.getSnapshot(), coins }).save() };
}
const radio = (item: string, option: string) =>
  $<HTMLButtonElement>(
    `#cat-maker [data-item="${item}"][data-option="${option}"]`,
  );
const cardButtons = () =>
  Array.from(
    document.querySelectorAll<HTMLButtonElement>('#city-action-buttons button'),
  );
/** The guide points at a free plot on the starter district; the salon goes up there. */
function buildSalon() {
  pressEnter('#city-tab-guide');
  pressEnter('#city-action');
  pressEnter('#build-cat_salon');
}
/** Mochi's roster portrait in the world, as the page holds its markup. */
const portraitOf = (world: WorldState) => {
  const box = document.createElement('div');
  box.innerHTML = rosterScreen(world, 'mochi', false)[0]!.portrait;
  return box.innerHTML;
};

describe('the cat salon (cat-looks.md 3)', () => {
  it('goes from the salon to a new look with the keyboard alone', () => {
    const game = openGame({ storage: saved() });
    buildSalon();
    const built = game.world();
    expect(built.buildings.map((building) => building.type)).toEqual([
      'CAT_APARTMENT',
      'CAT_SALON',
    ]);
    expect(built.coins).toBe(5000 - buildingPrice('CAT_SALON', 0));
    // The card is the salon's now: one way in for each companion.
    expect(text('#city-selection-label')).toBe('猫咪美容院');
    expect(cardButtons().map((button) => button.textContent)).toEqual([
      '移动建筑',
      '给 Mochi 改造',
      '给 Pepper 改造',
    ]);
    pressEnter('#restyle-mochi');
    // The maker opens on Mochi as it looks, without the breed, the price on confirm.
    expect(visible('#cat-maker')).toBe(true);
    expect(document.querySelector('#cat-maker [data-item="breed"]')).toBeNull();
    expect(text('#cat-maker-confirm')).toBe(`改造 · ${RESTYLE_PRICE} 金币`);
    expect(document.activeElement).toBe(radio('colour', 'cream'));
    expect(game.world()).toBe(built);
    // Cream → white; then Tab past the other rows, 🎲 and cancel to confirm.
    key('keydown', 'ArrowRight');
    expect(document.activeElement).toBe(radio('colour', 'white'));
    for (let stop = 0; stop < 7; stop++) key('keydown', 'Tab');
    expect(document.activeElement).toBe($('#cat-maker-confirm'));
    key('keydown', 'Enter');
    expect(document.querySelector('#cat-maker')).toBeNull();
    const after = game.world();
    expect(after.cats[0]!.appearance).toEqual({
      ...built.cats[0]!.appearance,
      colour: 'white',
    });
    expect(after.cats[0]!.breedId).toBe(built.cats[0]!.breedId);
    expect(after.coins).toBe(built.coins - RESTYLE_PRICE);
    expect(game.session.lastCommand()?.command).toEqual({
      type: 'RESTYLE_CAT',
      catId: 'mochi',
      appearance: after.cats[0]!.appearance,
    });
    expect(text('#notice')).toBe(
      `Mochi 换了新样子，改造花了 ${RESTYLE_PRICE} 金币。`,
    );
    // Focus goes back to where the maker was opened.
    expect(document.activeElement).toBe($('#restyle-mochi'));
    // The roster draws the new look at once.
    openCats('roster');
    const roster = $('[data-cat-id="mochi"] svg').outerHTML;
    expect(roster).toBe(portraitOf(after));
    expect(roster).not.toBe(portraitOf(built));
  });

  it('sends nothing on cancel, and charges nothing for the same look', () => {
    const game = openGame({ storage: saved() });
    buildSalon();
    const built = game.world();
    const command = game.session.lastCommand();
    click('#restyle-mochi');
    click('#cat-maker [data-item="face"][data-option="long"]');
    click('#cat-maker-cancel');
    expect(document.querySelector('#cat-maker')).toBeNull();
    expect(game.world()).toBe(built);
    expect(game.session.lastCommand()).toEqual(command);
    expect(document.activeElement).toBe($('#restyle-mochi'));
    click('#restyle-mochi');
    key('keydown', 'Escape');
    expect(game.world()).toBe(built);
    // Confirming the look it already has is refused by Core: nothing is paid.
    click('#restyle-mochi');
    click('#cat-maker-confirm');
    expect(game.world().coins).toBe(built.coins);
    expect(text('#notice')).toBe('样子和原来一样，没有改造，也没有收费。');
  });

  it('keeps the card’s buttons while the clock runs, and disables them without coins', () => {
    const game = openGame({
      storage: saved(buildingPrice('CAT_SALON', 0) + RESTYLE_PRICE - 1),
    });
    buildSalon();
    const buttons = cardButtons();
    expect(buttons.slice(1).every((button) => button.disabled)).toBe(true);
    expect(text('#city-action-reason')).toBe(
      `金币不足：需要 ${RESTYLE_PRICE}，现有 ${RESTYLE_PRICE - 1}。`,
    );
    for (let tick = 0; tick < 5; tick++)
      expect(
        game.session.execute({ type: 'ADVANCE_TIME', minutes: 10 }).ok,
      ).toBe(true);
    const after = cardButtons();
    expect(after).toHaveLength(buttons.length);
    after.forEach((button, index) => expect(button).toBe(buttons[index]));
    expect(buttons.every((button) => button.isConnected)).toBe(true);
  });
});

describe('the salon’s maker (cat-looks.md 4)', () => {
  it('opens on the cat as it is, its breed kept, the price on the confirm button', () => {
    const cat = createWorld(42).getSnapshot().cats[0]!;
    expect(salonMaker(cat)).toEqual({
      pickBreed: false,
      confirm: `改造 · ${RESTYLE_PRICE} 金币`,
      breed: cat.breedId,
      appearance: cat.appearance,
    });
  });
});
