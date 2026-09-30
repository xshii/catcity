import { describe, expect, it } from 'vitest';
import {
  $,
  click,
  openGame,
  pressEnter,
  text,
  visible,
} from '../helpers/view-rig';
import { openCats } from '../helpers/view-player';
import { fullCity } from '../helpers/world';

// Spec 041 T-12 (ui-design 5.1, 5.2): ten cats in the cats panel, and a cat's detail.

const storage = () => ({ 'cat-city.save.v1': fullCity().save() });
const rows = () =>
  Array.from(document.querySelectorAll<HTMLElement>('#cat-energy-cards > li'));
const details = (id: string) => `[data-cat-details="${id}"]`;
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

  it('a tap selects a cat; only the selected row offers its detail', () => {
    const game = openGame({ storage: storage() });
    openCats();
    const [mochi, , niangao] = game.world().cats;
    expect(pressed()).toEqual([mochi!.id]);
    expect(visible(details(mochi!.id))).toBe(true);
    expect(visible(details(niangao!.id))).toBe(false);
    click(`[data-cat-id="${niangao!.id}"]`);
    expect(game.session.selectedEntity).toBe(niangao!.id);
    expect(pressed()).toEqual([niangao!.id]);
    expect(visible(details(mochi!.id))).toBe(false);
    expect(visible(details(niangao!.id))).toBe(true);
    expect(text(details(niangao!.id))).toBe('详情 ›');
    expect($(details(niangao!.id)).getAttribute('aria-label')).toBe(
      '年糕 的详情',
    );
  });

  it('keeps every row and button through clock ticks', () => {
    const game = openGame({ storage: storage() });
    openCats();
    const last = game.world().cats.at(-1)!.id;
    click(`[data-cat-id="${last}"]`);
    const before = rows();
    const buttons = [$(`[data-cat-id="${last}"]`), $(details(last))];
    buttons[1]!.focus();
    for (let second = 0; second < 5; second++)
      expect(
        game.session.execute({ type: 'ADVANCE_TIME', minutes: 1 }).ok,
      ).toBe(true);
    rows().forEach((item, index) => expect(item).toBe(before[index]));
    expect([$(`[data-cat-id="${last}"]`), $(details(last))]).toEqual(buttons);
    expect(buttons.every((button) => button.isConnected)).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('the detail takes the roster’s place, with "now" open, and goes back', () => {
    const game = openGame({ storage: storage() });
    openCats();
    const pepper = game.world().cats[1]!;
    click(`[data-cat-id="${pepper.id}"]`);
    click(details(pepper.id));
    expect(visible('#cat-profile')).toBe(true);
    expect(visible('#river-roster')).toBe(false);
    expect(visible('#invite-open')).toBe(false);
    expect(document.activeElement).toBe($('#profile-back'));
    expect(text('#profile-name')).toContain('Pepper');
    expect(text('#profile-about')).toBe(
      '英短猫 · 一代目 · 好奇 · 活泼 · 爱冒险',
    );
    expect(visible('#profile-now')).toBe(true);
    expect(text('#profile-now')).toContain('心情');
    expect(visible('#profile-likes')).toBe(false);
    expect(visible('#profile-family')).toBe(false);
    expect($('#profile-toggle-now').getAttribute('aria-expanded')).toBe('true');
    click('#profile-toggle-family');
    expect(visible('#profile-family')).toBe(true);
    expect(text('#profile-family')).toContain('从别处来到小城');
    expect(text('#profile-family')).toContain('还没有孩子');
    const toggles = ['now', 'likes', 'family'].map((id) =>
      $(`#profile-toggle-${id}`),
    );
    for (let second = 0; second < 5; second++)
      game.session.execute({ type: 'ADVANCE_TIME', minutes: 1 });
    toggles.forEach((toggle, index) =>
      expect($(`#profile-toggle-${['now', 'likes', 'family'][index]}`)).toBe(
        toggle,
      ),
    );
    click('#profile-back');
    expect(visible('#cat-profile')).toBe(false);
    expect(visible('#river-roster')).toBe(true);
    expect(document.activeElement).toBe($(details(pepper.id)));
  });

  it('works with the keyboard alone', () => {
    const game = openGame({ storage: storage() });
    pressEnter('#city-tab-cats');
    const buding = game.world().cats.find((cat) => cat.name === '布丁')!;
    pressEnter(`[data-cat-id="${buding.id}"]`);
    expect(game.session.selectedEntity).toBe(buding.id);
    pressEnter(details(buding.id));
    expect(document.activeElement).toBe($('#profile-back'));
    expect(text('#profile-name')).toContain('布丁');
    pressEnter('#profile-toggle-likes');
    expect(visible('#profile-likes')).toBe(true);
    expect(text('#profile-likes')).toContain('摸摸');
    pressEnter('#profile-toggle-likes');
    expect(visible('#profile-likes')).toBe(false);
    pressEnter('#profile-back');
    expect(visible('#river-roster')).toBe(true);
    expect(document.activeElement).toBe($(details(buding.id)));
  });
});
