import { describe, expect, it, vi } from 'vitest';
import { CAT_DEFINITIONS } from '../../src/content/cats';
import { createWorld, loadWorld } from '../../src/core/world';
import { $, click, key, openGame, text, visible } from '../helpers/view-rig';

// Spec 041 T-14 PR 2 (cat-looks.md 2): a new game starts with a stray by the road and the
// cat maker, the one time a breed is picked.

const SAVE_KEY = 'cat-city.save.v1';
const radio = (item: string, option: string) =>
  `#cat-maker [data-item="${item}"][data-option="${option}"]`;
/** The chosen option of each row, as the maker marks it. */
const checked = () =>
  Object.fromEntries(
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '#cat-maker [role="radio"][aria-checked="true"]',
      ),
      (button) => [button.dataset.item, button.dataset.option],
    ),
  );

describe('a new game starts with a stray (cat-looks.md 2)', () => {
  it('opens on the stray by the road, holding the city clock and saving nothing', () => {
    const game = openGame({ strayStart: true });
    expect(visible('#stray-start')).toBe(true);
    expect(text('#stray-title')).toBe('路边捡到一只流浪猫');
    expect(document.activeElement).toBe($('#stray-look'));
    expect(game.starting()).toBe(true);
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
  });

  it('starts the game with the breed and look picked in the maker, and saves it', () => {
    const game = openGame({ strayStart: true });
    click('#stray-look');
    expect(visible('#stray-start')).toBe(false);
    expect(visible('#cat-maker')).toBe(true);
    // The one time a breed may be picked; a domestic cat to start from.
    expect(checked().breed).toBe('DOMESTIC');
    click(radio('breed', 'BRITISH_SHORTHAIR'));
    click(radio('colour', 'black'));
    click(radio('white', 'mittens'));
    click('#cat-maker-confirm');
    const stray = {
      breed: 'BRITISH_SHORTHAIR',
      appearance: {
        ...CAT_DEFINITIONS.MOCHI.appearance,
        colour: 'black',
        white: 'mittens',
      },
    } as const;
    expect(document.querySelector('#cat-maker')).toBeNull();
    expect(visible('#stray-start')).toBe(false);
    expect(game.starting()).toBe(false);
    const mochi = game.world().cats[0]!;
    expect(mochi.breedId).toBe(stray.breed);
    expect(mochi.appearance).toEqual(stray.appearance);
    expect(game.world()).toEqual(createWorld(42, stray).getSnapshot());
    expect(game.session.getReplay().initialSave).toBe(
      createWorld(42, stray).save(),
    );
    expect(loadWorld(localStorage.getItem(SAVE_KEY)!).getSnapshot()).toEqual(
      game.world(),
    );
    expect(text('#notice')).toBe('你把它抱回了小城。它叫 Mochi。');
  });

  it('draws 🎲 from the view’s own randomness: fixed, it makes the same cat', () => {
    const randoms = [0.5, 0, 0.99, 0.2, 0.7, 0.4];
    let next = 0;
    vi.spyOn(Math, 'random').mockImplementation(
      () => randoms[next++ % randoms.length]!,
    );
    const game = openGame({ strayStart: true });
    click('#stray-look');
    click('#cat-maker-random');
    const made = {
      breed: 'RAGDOLL',
      colour: 'black',
      pattern: 'point',
      white: 'mittens',
      eyes: 'green',
      face: 'pointed',
    };
    expect(checked()).toEqual(made);
    click('#cat-maker-confirm');
    const { breed, ...appearance } = made;
    expect(game.world().cats[0]).toMatchObject({ breedId: breed, appearance });
  });

  it('comes back to the stray on cancel: the game cannot start without a cat', () => {
    const game = openGame({ strayStart: true });
    click('#stray-look');
    click(radio('colour', 'orange'));
    click('#cat-maker-cancel');
    expect(visible('#stray-start')).toBe(true);
    expect(document.activeElement).toBe($('#stray-look'));
    expect(document.querySelector('#cat-maker')).toBeNull();
    // Nothing closes the stray but a cat: Escape and Tab stay.
    key('keydown', 'Escape');
    key('keydown', 'Tab');
    expect(visible('#stray-start')).toBe(true);
    expect(document.activeElement).toBe($('#stray-look'));
    expect(game.starting()).toBe(true);
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
    // Escape in the maker comes back here too.
    click('#stray-look');
    key('keydown', 'Escape');
    expect(visible('#stray-start')).toBe(true);
  });

  it('puts the settings gear on the maker’s Tab round', () => {
    openGame({ strayStart: true });
    click('#stray-look');
    const gear = $('#settings-gear');
    expect(document.activeElement).toBe($(radio('breed', 'DOMESTIC')));
    key('keydown', 'Tab', true);
    expect(document.activeElement).toBe(gear);
    key('keydown', 'Tab');
    expect(document.activeElement).toBe($(radio('breed', 'DOMESTIC')));
    key('keydown', 'Tab', true);
    key('keydown', 'Tab', true);
    expect(document.activeElement).toBe($('#cat-maker-confirm'));
    // From the gear, Escape leaves the maker for the stray.
    gear.focus();
    key('keydown', 'Escape');
    expect(document.querySelector('#cat-maker')).toBeNull();
    expect(visible('#stray-start')).toBe(true);
  });

  it('resumes a saved game without the stray', () => {
    const game = openGame({
      strayStart: true,
      storage: { [SAVE_KEY]: createWorld(42).save() },
    });
    expect(visible('#stray-start')).toBe(false);
    expect(game.starting()).toBe(false);
  });

  it('keeps a rejected save until the reset, which starts with the stray', () => {
    const game = openGame({
      strayStart: true,
      storage: { [SAVE_KEY]: 'broken' },
    });
    expect(visible('#stray-start')).toBe(false);
    click('#reset-demo');
    expect(visible('#stray-start')).toBe(true);
    expect(localStorage.getItem(SAVE_KEY)).toBe('broken');
    click('#stray-look');
    click(radio('breed', 'RAGDOLL'));
    click('#cat-maker-confirm');
    expect(game.world().cats[0]!.breedId).toBe('RAGDOLL');
    expect(loadWorld(localStorage.getItem(SAVE_KEY)!).getSnapshot()).toEqual(
      game.world(),
    );
  });

  it('leaves the stray out of a test build’s new game: Mochi is its template', () => {
    const game = openGame();
    expect(visible('#stray-start')).toBe(false);
    expect(game.starting()).toBe(false);
    expect(game.world()).toEqual(createWorld(42).getSnapshot());
  });
});
