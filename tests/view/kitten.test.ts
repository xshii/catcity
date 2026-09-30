import { describe, expect, it } from 'vitest';
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
import { PEPPER_ID, pairAndStranger, readyPair } from '../helpers/family';

// Spec 041 T-22 (R-32; ui-design 4.2, 5.4, 7, 8): a kitten from the list of partners.
// The way under a partner who misses nothing asks first, then names the kitten; only a
// name sends BREED_CATS. Core's rules are unit-tested (tests/unit/breed.test.ts).

const saved = (world = readyPair()) => ({
  'cat-city.save.v1': world.save(),
});
const KITTEN = 'cat-3';
const commands = (game: Game) => game.session.getDiagnostics().commandCount;
const chips = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>('#name-suggestions [role="radio"]'),
  );
/** The two sexes in a kitten's name box: 公 then 母. */
const sexes = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>('#name-sex [role="radio"]'),
  );
const sexChecked = () =>
  sexes().map((choice) => choice.getAttribute('aria-checked') === 'true');
/** Mochi's list of partners, open, by touch. */
function openList() {
  openCats('roster');
  click('#breed-open');
}

describe('a kitten from the list of partners (T-22)', () => {
  it('is offered only under a partner who misses nothing', () => {
    openGame({ storage: saved(pairAndStranger()) });
    openList();
    // Pepper is short of happy, the second Mochi is no pair: no way to a kitten yet.
    expect(visible(`[data-breed-with="${PEPPER_ID}"]`)).toBe(false);
    expect(visible('[data-breed-with="cat-3"]')).toBe(false);
  });

  it('asks first, with what follows and what it takes, and asking changes nothing', () => {
    const game = openGame({ storage: saved() });
    openList();
    const way = `[data-breed-with="${PEPPER_ID}"]`;
    expect(visible(way)).toBe(true);
    expect(text(way)).toBe('生小猫…');
    expect($(way).getAttribute('aria-label')).toBe('和 Pepper 生小猫');
    const before = game.session.getSnapshot();
    click(way);
    expect(visible('#confirm')).toBe(true);
    expect(text('#confirm-title')).toBe('Mochi 和 Pepper 要有小猫了');
    expect(
      Array.from($('#confirm-body').children, (line) => line.textContent),
    ).toEqual([
      '小猫会像爸爸妈妈，具体像谁，生下来才知道。',
      '之后 Mochi 和 Pepper 要休息 3 天才能再生小猫。',
    ]);
    expect(text('#confirm-cost')).toBe(
      '小猫要一张空床，也算一只伙伴猫（小城最多 10 只）。',
    );
    expect(text('#confirm-ok')).toBe('生小猫');
    expect(document.activeElement).toBe($('#confirm-cancel'));
    expect(game.session.getSnapshot()).toBe(before);
  });

  it.each([
    ['the confirmation', () => click('#confirm-cancel')],
    [
      'the name box',
      () => {
        click('#confirm-ok');
        expect(visible('#name-dialog')).toBe(true);
        click('#name-cancel');
      },
    ],
    [
      'the name box, by Escape',
      () => {
        click('#confirm-ok');
        key('keydown', 'Escape');
      },
    ],
  ])('cancelled at %s, sends nothing and uses no id', (_, cancel) => {
    const game = openGame({ storage: saved() });
    openList();
    const sent = commands(game);
    const before = game.world();
    click(`[data-breed-with="${PEPPER_ID}"]`);
    cancel();
    expect(document.querySelector('#name-dialog')).toBeNull();
    expect(visible('#confirm')).toBe(false);
    expect(commands(game)).toBe(sent);
    expect(game.world()).toEqual(before);
    expect(document.activeElement).toBe($(`[data-breed-with="${PEPPER_ID}"]`));
  });

  it('names the kitten in the box, sends BREED_CATS, shows its birth and selects it', () => {
    const game = openGame({ storage: saved() });
    openList();
    const nextId = game.world().nextId;
    click(`[data-breed-with="${PEPPER_ID}"]`);
    click('#confirm-ok');
    // The name box of a kitten: the first suggestion in the field, the keyboard down.
    expect(text('#name-title')).toBe('给小猫起个名字');
    expect(text('#name-confirm')).toBe('就叫这个');
    expect($<HTMLInputElement>('#name-input').value).toBe(
      chips()[0]!.textContent,
    );
    expect(document.activeElement).not.toBe($('#name-input'));
    // Its sex, the player's (user 2026-09-30): 公 or 母, neither at first, and no
    // kitten until one is chosen.
    expect($('#name-sex').getAttribute('role')).toBe('radiogroup');
    expect(sexes().map((choice) => choice.textContent)).toEqual([
      '♂ 公',
      '♀ 母',
    ]);
    expect(sexChecked()).toEqual([false, false]);
    expect($<HTMLButtonElement>('#name-confirm').disabled).toBe(true);
    expect(text('#name-sex-note')).toBe('先选：公猫还是母猫');
    const name = chips()[2]!.textContent;
    click('#name-suggestions [role="radio"]:nth-child(3)');
    click('#name-sex [role="radio"]:nth-child(3)');
    expect(sexChecked()).toEqual([false, true]);
    expect(text('#name-sex-note')).toBe('');
    click('#name-confirm');
    expect(game.session.lastCommand()!.command).toEqual({
      type: 'BREED_CATS',
      motherId: 'mochi',
      fatherId: PEPPER_ID,
      name,
      sex: 'F',
    });
    const kitten = game.world().cats.at(-1)!;
    expect(kitten).toMatchObject({
      id: `cat-${nextId}`,
      name,
      sex: 'F',
      generation: 2,
    });
    // ui-design 5.4 step 3: the card, a dialog with its one button in focus.
    expect(visible('#birth-card')).toBe(true);
    expect($('#birth-card').getAttribute('role')).toBe('dialog');
    expect(text('#birth-title')).toBe(`${name} 出生了`);
    // The sex chosen, the breed one of the parents'.
    expect(text('#birth-about')).toMatch(/^♀ 母 · (布偶猫|英短猫) · 二代目$/);
    expect(text('#birth-like')).toMatch(/^眼睛/);
    expect(text('#birth-home')).toBe('它住进了 1 号公寓。');
    expect(text('#birth-grows')).toBe('再过 2 天就长大了。');
    expect(visible('#birth-talent')).toBe(false);
    expect(document.activeElement).toBe($('#birth-see'));
    click('#birth-see');
    expect(document.querySelector('#birth-card')).toBeNull();
    expect(game.session.selectedEntity).toBe(kitten.id);
    expect(document.activeElement).toBe($(`[data-cat-id="${kitten.id}"]`));
    // The roster has the kitten; its parents now rest.
    expect(text(`[data-cat-id="${kitten.id}"] strong`)).toBe(name);
    click('[data-cat-id="mochi"]');
    expect(text(`[data-partner-id="${PEPPER_ID}"]`)).toContain('还在休息');
  });

  it('goes through with the keyboard alone, 母 chosen with the arrows', () => {
    const game = openGame({ storage: saved() });
    pressEnter('#city-tab-cats');
    pressEnter('#cats-tab-roster');
    pressEnter('#breed-open');
    pressEnter(`[data-breed-with="${PEPPER_ID}"]`);
    key('keydown', 'Tab');
    expect(document.activeElement).toBe($('#confirm-ok'));
    key('keydown', 'Enter');
    expect(visible('#name-dialog')).toBe(true);
    const name = $<HTMLInputElement>('#name-input').value;
    // Tab first reaches the two sexes, then the field and the rest of the box.
    key('keydown', 'Tab');
    expect(document.activeElement).toBe(sexes()[0]);
    key('keydown', 'ArrowRight');
    expect(document.activeElement).toBe(sexes()[1]);
    key('keydown', 'ArrowRight');
    expect(document.activeElement).toBe(sexes()[0]);
    key('keydown', 'ArrowLeft');
    key('keydown', 'Enter');
    expect(sexChecked()).toEqual([false, true]);
    key('keydown', 'Tab');
    expect(document.activeElement).toBe($('#name-input'));
    $('#name-confirm').focus();
    key('keydown', 'Enter');
    expect(game.world().cats.at(-1)).toMatchObject({ name, sex: 'F' });
    expect(document.activeElement).toBe($('#birth-see'));
    key('keydown', 'Tab');
    expect(document.activeElement).toBe($('#birth-see'));
    key('keydown', 'Enter');
    expect(document.querySelector('#birth-card')).toBeNull();
    expect(game.session.selectedEntity).toBe(KITTEN);
  });

  it('keeps the rows and their buttons while the city clock runs and after a birth', () => {
    const game = openGame({ storage: saved() });
    openList();
    const row = $(`[data-partner-id="${PEPPER_ID}"]`);
    const way = $(`[data-breed-with="${PEPPER_ID}"]`);
    for (let second = 0; second < 5; second++)
      expect(
        game.session.execute({ type: 'ADVANCE_TIME', minutes: 1 }).ok,
      ).toBe(true);
    expect($(`[data-partner-id="${PEPPER_ID}"]`)).toBe(row);
    expect($(`[data-breed-with="${PEPPER_ID}"]`)).toBe(way);
    click(`[data-breed-with="${PEPPER_ID}"]`);
    click('#confirm-ok');
    click('#name-sex [role="radio"]:nth-child(2)');
    click('#name-confirm');
    click('#birth-see');
    click('[data-cat-id="mochi"]');
    expect($(`[data-partner-id="${PEPPER_ID}"]`)).toBe(row);
    expect(visible(way)).toBe(false);
  });
});
