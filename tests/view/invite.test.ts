import { describe, expect, it } from 'vitest';
import { INVITABLE_CATS } from '../../src/content/cats';
import { createWorld, World } from '../../src/core/world';
import { ERROR_MESSAGES } from '../../src/view/common/errors';
import {
  $,
  click,
  openGame,
  pressEnter,
  text,
  visible,
} from '../helpers/view-rig';
import { openCats } from '../helpers/view-player';
import { buildApartment } from '../helpers/world';

// Spec 041 T-11 (ui-design 5.3): inviting a new companion from the cats panel.

/** A new game saved with `apartments` apartments built and then `coins` coins. */
function saved(apartments: number, coins = 1000) {
  const world = new World({ ...createWorld(42).getSnapshot(), coins: 5000 });
  for (let built = 0; built < apartments; built++) buildApartment(world);
  return {
    'cat-city.save.v1': new World({ ...world.getSnapshot(), coins }).save(),
  };
}
const rows = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-invite]')).filter(
    (row) => visible(row),
  );
const shown = () => rows().map((row) => row.dataset.invite);
const button = (id: string) =>
  $<HTMLButtonElement>(`[data-invite-cat="${id}"]`);
const reason = (id: string) => text(`[data-invite="${id}"] .invite-reason`);
const openList = () => {
  openCats();
  click('#invite-open');
};

describe('inviting a new companion (ui-design 5.3)', () => {
  it('the list shows every cat not yet in the city, with who it is and the price', () => {
    openGame({ storage: saved(1) });
    openCats();
    expect(text('#invite-open')).toContain(
      `邀请新伙伴（还能邀请 ${INVITABLE_CATS.length} 只）`,
    );
    click('#invite-open');
    // The list takes the roster's place; the way back is at its top.
    expect(visible('#cat-invite')).toBe(true);
    expect(visible('#river-roster')).toBe(false);
    expect(visible('#invite-open')).toBe(false);
    expect(text('#invite-beds')).toBe('新伙伴需要一张空床。现有空床：2');
    expect(shown()).toEqual([...INVITABLE_CATS]);
    const doubao = text('[data-invite="DOUBAO"]');
    for (const words of [
      '豆包',
      '英短猫',
      '随和 · 懒洋洋',
      '喜欢：海鲷、月光鲤',
      '能吸引 5 星月光鲤',
    ])
      expect(doubao).toContain(words);
    // The sex is a symbol on screen and a word for screen readers.
    const sex = $('[data-invite="DOUBAO"] .invite-sex');
    expect(sex.textContent).toBe('♂');
    expect(sex.getAttribute('aria-label')).toBe('公');
    expect($('[data-invite="DOUBAO"] svg')).toBeTruthy();
    for (const id of INVITABLE_CATS) {
      expect(button(id).textContent).toBe('邀请 · 200 金币');
      expect(button(id).disabled).toBe(false);
      expect(reason(id)).toBe('');
    }
    click('#invite-back');
    expect(visible('#cat-invite')).toBe(false);
    expect(visible('#river-roster')).toBe(true);
  });

  it('without a free bed every button is disabled, with the reason under it', () => {
    openGame();
    openList();
    for (const id of INVITABLE_CATS) {
      expect(button(id).disabled).toBe(true);
      expect(reason(id)).toBe(ERROR_MESSAGES.NO_BED);
      expect(visible(`[data-invite="${id}"] .invite-reason`)).toBe(true);
    }
  });

  it('short of coins, the reason gives the price and the coins there are', () => {
    openGame({ storage: saved(1, 120) });
    openList();
    expect(button('PEPPER').disabled).toBe(true);
    expect(reason('PEPPER')).toBe('金币不足：需要 200，现有 120。');
  });

  it('an invited cat moves in, the list closes and has one cat fewer', () => {
    const game = openGame({ storage: saved(1) });
    openList();
    click('[data-invite-cat="NIANGAO"]');
    const world = game.world();
    const niangao = world.cats.find((cat) => cat.definitionId === 'NIANGAO')!;
    expect(niangao.home).toBe(world.buildings[0]!.id);
    expect(world.coins).toBe(1000 - 200);
    expect(text('#notice')).toBe('年糕 来到了小城，住进了 1 号公寓。');
    // Back on the roster, where the newcomer now has its card.
    expect(visible('#cat-invite')).toBe(false);
    expect(visible(`[data-cat-id="${niangao.id}"]`)).toBe(true);
    expect(document.activeElement).toBe($('#invite-open'));
    expect(text('#invite-open')).toContain('还能邀请 4 只');
    click('#invite-open');
    expect(shown()).toEqual(INVITABLE_CATS.filter((id) => id !== 'NIANGAO'));
    expect(text('#invite-beds')).toBe('新伙伴需要一张空床。现有空床：1');
    for (const id of shown())
      expect(button(id!).textContent).toBe('邀请 · 400 金币');
  });

  it('keeps its buttons through clock ticks', () => {
    const game = openGame({ storage: saved(1) });
    openList();
    const before = INVITABLE_CATS.map(button);
    before[2]!.focus();
    for (let second = 0; second < 5; second++)
      expect(
        game.session.execute({ type: 'ADVANCE_TIME', minutes: 1 }).ok,
      ).toBe(true);
    const after = INVITABLE_CATS.map(button);
    after.forEach((element, index) => expect(element).toBe(before[index]));
    expect(before.every((element) => element.isConnected)).toBe(true);
    expect(document.activeElement).toBe(before[2]);
  });

  it('works with the keyboard alone', () => {
    const game = openGame({ storage: saved(1) });
    openCats();
    pressEnter('#invite-open');
    expect(visible('#cat-invite')).toBe(true);
    // The list opens with the focus on its way back.
    expect(document.activeElement).toBe($('#invite-back'));
    pressEnter('[data-invite-cat="BUDING"]');
    expect(game.world().cats.map((cat) => cat.name)).toEqual(['Mochi', '布丁']);
    expect(document.activeElement).toBe($('#invite-open'));
    pressEnter('#invite-open');
    pressEnter('#invite-back');
    expect(visible('#cat-invite')).toBe(false);
    expect(document.activeElement).toBe($('#invite-open'));
  });
});
