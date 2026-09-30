import { describe, expect, it } from 'vitest';
import { NEUTER_PRICE } from '../../src/content/family';
import { World } from '../../src/core/world';
import {
  $,
  click,
  key,
  openGame,
  pressEnter,
  text,
  visible,
  type Game,
} from '../helpers/view-rig';
import { openCats } from '../helpers/view-player';
import { readyPair } from '../helpers/family';

// Spec 041 T-20 (R-30; ui-design 4.2, 5.2): neutering from a cat's family section, which
// asks first. Core's rules are unit-tested (tests/unit/neuter.test.ts).

/** Mochi and Pepper, ready to have a kitten, with `coins`. */
const saved = (coins = 700) => ({
  'cat-city.save.v1': new World({
    ...readyPair().getSnapshot(),
    coins,
  }).save(),
});
/** Mochi's detail with its family section open, by touch. */
const openFamily = () => {
  openCats();
  click('[data-cat-details="mochi"]');
  click('#profile-toggle-family');
};
const mochi = (game: Game) => game.world().cats[0]!;
const commands = (game: Game) => game.session.getDiagnostics().commandCount;

describe('neutering from a cat’s family (spec 041 T-20)', () => {
  it('the family section offers it for the cat, and it asks first', () => {
    const game = openGame({ storage: saved() });
    openFamily();
    expect(visible('#profile-neuter')).toBe(true);
    expect(text('#profile-neuter')).toBe('绝育…');
    expect($('#profile-neuter').getAttribute('aria-label')).toBe(
      '给 Mochi 做绝育',
    );
    expect(visible('#confirm')).toBe(false);
    const before = game.session.getSnapshot();
    click('#profile-neuter');
    // ui-design 4.2: a question, what follows and that it cannot be undone, the price,
    // cancel on the left with the focus, the act itself on the right.
    expect(visible('#confirm')).toBe(true);
    expect($('#confirm').getAttribute('role')).toBe('alertdialog');
    expect($('#confirm').getAttribute('aria-modal')).toBe('true');
    expect(text('#confirm-title')).toBe('给 Mochi 做绝育？');
    expect(
      Array.from($('#confirm-body').children, (line) => line.textContent),
    ).toEqual(['做了之后 Mochi 不能再生小猫。', '这件事不能撤销。']);
    expect(text('#confirm-cost')).toBe(`花费 ${NEUTER_PRICE} 金币`);
    expect(
      Array.from($('#confirm').querySelectorAll('button'), (button) => [
        button.id,
        button.textContent,
      ]),
    ).toEqual([
      ['confirm-cancel', '取消'],
      ['confirm-ok', '确定绝育'],
    ]);
    expect(document.activeElement).toBe($('#confirm-cancel'));
    // Asking changes nothing.
    expect(game.session.getSnapshot()).toBe(before);
  });

  it.each([
    ['取消', () => click('#confirm-cancel')],
    ['the scrim', () => click('.confirm-shade')],
    ['Escape', () => key('keydown', 'Escape')],
  ])('%s cancels: no command is sent, and the focus is back', (_, cancel) => {
    const game = openGame({ storage: saved() });
    openFamily();
    const sent = commands(game);
    const before = game.session.getSnapshot();
    click('#profile-neuter');
    cancel();
    expect(visible('#confirm')).toBe(false);
    expect(visible('.confirm-shade')).toBe(false);
    expect(commands(game)).toBe(sent);
    expect(game.session.getSnapshot()).toBe(before);
    expect(mochi(game).neutered).toBe(false);
    expect(document.activeElement).toBe($('#profile-neuter'));
    // Only the dialog closes: Escape leaves the panel and the detail open.
    expect(visible('#cat-profile')).toBe(true);
    expect(visible('#profile-neuter')).toBe(true);
  });

  it('confirming neuters the cat for the price; "已绝育" takes the button’s place', () => {
    const game = openGame({ storage: saved() });
    openFamily();
    click('#profile-neuter');
    click('#confirm-ok');
    expect(visible('#confirm')).toBe(false);
    expect(game.world().coins).toBe(700 - NEUTER_PRICE);
    expect(mochi(game).neutered).toBe(true);
    expect(game.session.lastCommand()?.command).toEqual({
      type: 'NEUTER_CAT',
      catId: 'mochi',
    });
    expect(text('#notice')).toBe('Mochi 做好了绝育。');
    expect(visible('#profile-neuter')).toBe(false);
    expect(text('.profile-status')).toBe('已绝育');
    // The button is gone: the focus waits on the family's title.
    expect(document.activeElement).toBe($('#profile-toggle-family'));
    // T-21's list reads it: Mochi can have no kittens now.
    click('#profile-back');
    click('#breed-open');
    expect(text('#breed-self')).toContain('✗ Mochi 已经绝育了');
  });

  it('without the coins the button is off, and says what is missing', () => {
    const game = openGame({ storage: saved(NEUTER_PRICE - 1) });
    openFamily();
    expect($<HTMLButtonElement>('#profile-neuter').disabled).toBe(true);
    expect(text('.profile-reason')).toBe(
      `金币不足：需要 ${NEUTER_PRICE}，现有 ${NEUTER_PRICE - 1}。`,
    );
    expect(visible('.profile-status')).toBe(false);
    expect(mochi(game).neutered).toBe(false);
  });

  it('works with the keyboard alone, the focus kept inside the dialog', () => {
    const game = openGame({ storage: saved() });
    pressEnter('#city-tab-cats');
    pressEnter('[data-cat-details="mochi"]');
    pressEnter('#profile-toggle-family');
    pressEnter('#profile-neuter');
    expect(document.activeElement).toBe($('#confirm-cancel'));
    key('keydown', 'Tab');
    expect(document.activeElement).toBe($('#confirm-ok'));
    key('keydown', 'Tab');
    expect(document.activeElement).toBe($('#confirm-cancel'));
    key('keydown', 'Tab', true);
    expect(document.activeElement).toBe($('#confirm-ok'));
    key('keydown', 'Enter');
    expect(mochi(game).neutered).toBe(true);
    expect(document.activeElement).toBe($('#profile-toggle-family'));
  });

  it('keeps its button and the dialog through clock ticks', () => {
    const game = openGame({ storage: saved() });
    openFamily();
    const button = $('#profile-neuter');
    const tick = () => {
      for (let second = 0; second < 5; second++)
        expect(
          game.session.execute({ type: 'ADVANCE_TIME', minutes: 1 }).ok,
        ).toBe(true);
    };
    tick();
    expect($('#profile-neuter')).toBe(button);
    click('#profile-neuter');
    const dialog = [$('#confirm'), $('#confirm-cancel'), $('#confirm-ok')];
    tick();
    expect([$('#confirm'), $('#confirm-cancel'), $('#confirm-ok')]).toEqual(
      dialog,
    );
    expect(visible('#confirm')).toBe(true);
    expect(document.activeElement).toBe(dialog[1]);
    click('#confirm-cancel');
    click('#profile-neuter');
    // Asked again, it is the same dialog.
    expect($('#confirm')).toBe(dialog[0]);
    expect(document.querySelectorAll('#confirm')).toHaveLength(1);
  });
});
