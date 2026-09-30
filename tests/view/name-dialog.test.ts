import { describe, expect, it, vi } from 'vitest';
import { createWorld, suggestNames, type World } from '../../src/core';
import { mountNameDialog } from '../../src/view/cats/name-dialog';
import type { NameDialogInput } from '../../src/view/cats/name-dialog-screen';
import {
  $,
  choose,
  click,
  key,
  openGame,
  text,
  visible,
  type Game,
} from '../helpers/view-rig';
import { invite } from '../helpers/world';

// Spec 041 R-16 (ui-design 5.4 "起名的交互", 7, 8): the name box, and renaming a cat
// from its detail.

const save = (world: World) => ({ 'cat-city.save.v1': world.save() });
/** Mochi and Pepper. */
const pair = () => {
  const world = createWorld(42);
  invite(world);
  return world;
};
/** A kitten's naming (T-22) opens on the first suggestion; T-25 opens it for a rename. */
const KITTEN: NameDialogInput = {
  title: 'Mochi 和 Pepper 要有小猫了',
  confirm: '生小猫',
  initial: '',
  salt: 5,
};
const all = (selector: string) =>
  Array.from(
    document.querySelectorAll<HTMLElement>(`#name-dialog ${selector}`),
  );
const chips = () => all('[role="radio"]');
const checked = () =>
  chips().map((chip) => chip.getAttribute('aria-checked') === 'true');
const field = () => $<HTMLInputElement>('#name-input');

/** The box over the page, opened as a kitten's naming would open it. */
function mountBox(game: Game) {
  const offered = suggestNames(game.world(), KITTEN.salt, 0);
  // No sex is asked of this box: it gives none (T-22).
  const done = vi.fn<(name: string | null, sex: 'F' | 'M' | null) => void>();
  mountNameDialog({
    layer: document.body,
    world: game.world(),
    input: { ...KITTEN, initial: offered[0]! },
    done,
  });
  return { offered, done };
}
/** The box over the running game with Mochi and Pepper. */
function openBox() {
  const game = openGame({ storage: save(pair()) });
  return { game, ...mountBox(game) };
}
describe('the name box (ui-design 5.4)', () => {
  it('asks no sex unless it names a kitten (T-22)', () => {
    openBox();
    expect(document.querySelector('#name-sex')).toBeNull();
    expect($<HTMLButtonElement>('#name-confirm').disabled).toBe(false);
  });

  it('opens on the first suggestion, marked, and keeps the keyboard down', () => {
    const { offered } = openBox();
    expect(visible('#name-dialog')).toBe(true);
    expect($('#name-dialog').getAttribute('role')).toBe('dialog');
    expect(text('#name-title')).toBe(KITTEN.title);
    expect(text('#name-confirm')).toBe('生小猫');
    expect(field().value).toBe(offered[0]);
    expect(chips().map((chip) => chip.textContent)).toEqual(offered);
    expect(checked()).toEqual([true, false, false, false, false, false]);
    expect($('#name-suggestions').getAttribute('role')).toBe('radiogroup');
    expect($('#name-suggestions').getAttribute('aria-label')).toBe(
      '推荐的名字',
    );
    // The focus is in the box, but not in the field: no keyboard pops up.
    expect(document.activeElement).toBe($('#name-dialog'));
  });

  it('a suggestion tapped goes into the field, marked, and is not sent yet', () => {
    const { offered, done } = openBox();
    click('#name-dialog [role="radio"]:nth-child(3)');
    expect(field().value).toBe(offered[2]);
    expect(checked()).toEqual([false, false, true, false, false, false]);
    expect(done).not.toHaveBeenCalled();
    click('#name-confirm');
    expect(done).toHaveBeenCalledExactlyOnceWith(offered[2], null);
    expect(document.querySelector('#name-dialog')).toBeNull();
  });

  it('"换一批" shows six more and leaves the field alone', () => {
    const { game, offered } = openBox();
    choose('#name-input', '小黑');
    click('#name-more');
    expect(chips().map((chip) => chip.textContent)).toEqual(
      suggestNames(game.world(), KITTEN.salt, 1),
    );
    expect(chips().some((chip) => offered.includes(chip.textContent))).toBe(
      false,
    );
    expect(field().value).toBe('小黑');
  });

  it('cleared, it says which name it gives, and gives the first suggestion', () => {
    const { offered, done } = openBox();
    click('#name-more');
    click('#name-clear');
    expect(field().value).toBe('');
    expect(text('#name-note')).toBe(`不填的话就叫 ${offered[0]}`);
    expect($<HTMLButtonElement>('#name-confirm').disabled).toBe(false);
    click('#name-confirm');
    expect(done).toHaveBeenCalledExactlyOnceWith(offered[0], null);
  });

  it('takes 12 characters at most, and no line break', () => {
    openBox();
    choose('#name-input', '一二三四五六七八九十\n一二三四');
    expect(field().value).toBe('一二三四五六七八九十一二');
    expect(text('#name-note')).toBe('名字最多 12 个字');
  });

  it('gives nothing on cancel, Escape or a tap beside it', () => {
    const game = openGame({ storage: save(pair()) });
    for (const close of [
      () => click('#name-cancel'),
      () => key('keydown', 'Escape'),
      () => click('.name-scrim'),
    ]) {
      const { done } = mountBox(game);
      close();
      expect(done).toHaveBeenCalledExactlyOnceWith(null, null);
      expect(document.querySelector('#name-dialog')).toBeNull();
    }
  });

  it('keeps every button while the city clock runs', () => {
    const { game } = openBox();
    const buttons = all('button');
    for (let tick = 0; tick < 5; tick++)
      expect(
        game.session.execute({ type: 'ADVANCE_TIME', minutes: 10 }).ok,
      ).toBe(true);
    all('button').forEach((button, i) => expect(button).toBe(buttons[i]));
    expect(buttons.every((button) => button.isConnected)).toBe(true);
  });
});
