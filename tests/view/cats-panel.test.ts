import { describe, expect, it } from 'vitest';
import { $, click, openGame, text, visible } from '../helpers/view-rig';
import { openCats } from '../helpers/view-player';
import { fullCity } from '../helpers/world';

// Spec 041 T-12 (ui-design 5.1): ten cats in the cats panel.

const storage = () => ({ 'cat-city.save.v1': fullCity().save() });
const rows = () =>
  Array.from(document.querySelectorAll<HTMLElement>('#cat-energy-cards > li'));
const pressed = () =>
  Array.from(
    document.querySelectorAll('[data-cat-id][aria-pressed="true"]'),
    (card) => card.getAttribute('data-cat-id'),
  );

describe('the cats panel with ten cats (spec 041 T-12)', () => {
  it('lists every cat in one column, with its name, sex, generation, mood and bond', () => {
    const game = openGame({ storage: storage() });
    openCats();
    const cats = game.world().cats;
    expect(rows().map((item) => item.dataset.row)).toEqual(
      cats.map((cat) => cat.id),
    );
    const pepper = cats[1]!;
    const card = `[data-cat-id="${pepper.id}"]`;
    expect(text(`${card} strong`)).toBe('Pepper');
    expect(text(`${card} .roster-sex`)).toBe('♂');
    expect($(`${card} .roster-sex`).getAttribute('aria-label')).toBe('公');
    expect(text(`${card} .gen-badge`)).toBe('一代目');
    expect(text(`${card} .mood-line`)).toBe('😺 平静');
    expect(text(`${card} .bond-line`)).toBe('♡♡♡♡ 初识');
    expect(text(`${card} .energy-line`)).toBe('体力 100');
    // The invite entry still ends the page, after the roster.
    expect(visible('#invite-open')).toBe(true);
  });

  it('a tap selects a cat', () => {
    const game = openGame({ storage: storage() });
    openCats();
    const [mochi, , niangao] = game.world().cats;
    expect(pressed()).toEqual([mochi!.id]);
    click(`[data-cat-id="${niangao!.id}"]`);
    expect(game.session.selectedEntity).toBe(niangao!.id);
    expect(pressed()).toEqual([niangao!.id]);
  });

  it('keeps every row and button through clock ticks', () => {
    const game = openGame({ storage: storage() });
    openCats();
    const last = game.world().cats.at(-1)!.id;
    click(`[data-cat-id="${last}"]`);
    const before = rows();
    const button = $(`[data-cat-id="${last}"]`);
    for (let second = 0; second < 5; second++)
      expect(
        game.session.execute({ type: 'ADVANCE_TIME', minutes: 1 }).ok,
      ).toBe(true);
    rows().forEach((item, index) => expect(item).toBe(before[index]));
    expect($(`[data-cat-id="${last}"]`)).toBe(button);
    expect(button.isConnected).toBe(true);
    expect(document.activeElement).toBe(button);
  });
});
