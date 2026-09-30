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
import { pairAndStranger } from '../helpers/family';

/** Pepper is just short of happy; the second Mochi is a stranger yet. */
const family = () => ({ 'cat-city.save.v1': pairAndStranger().save() });
const rows = () =>
  Array.from(document.querySelectorAll<HTMLElement>('#breed-partners > li'));
/** Each cat in the list: its name, its sex as read aloud, and the lines under it. */
const listed = () =>
  rows().map((row) => ({
    name: row.querySelector('strong')!.textContent,
    sex: row.querySelector('[role="img"]')!.getAttribute('aria-label'),
    lines: Array.from(row.querySelectorAll('li'), (line) => line.textContent),
  }));

describe('who to have a kitten with, in the cats panel (spec 041 T-21)', () => {
  it('lists every other cat and each condition it misses, and changes nothing', () => {
    const game = openGame({ storage: family() });
    const before = game.world();
    openCats('roster');
    expect(text('#breed-open')).toBe('Mochi 和谁生小猫…');
    expect(visible('#breed-list')).toBe(false);
    click('#breed-open');
    expect($('#breed-open').getAttribute('aria-expanded')).toBe('true');
    expect(visible('#breed-list')).toBe(true);
    expect(listed()).toEqual([
      {
        name: 'Pepper',
        sex: '公',
        lines: ['✗ Pepper 现在不够开心（平静）：摸摸它，或者送它喜欢的鱼'],
      },
      {
        name: 'Mochi',
        sex: '母',
        lines: [
          '✗ 需要一公一母',
          '✗ Mochi 现在不够开心（平静）：摸摸它，或者送它喜欢的鱼',
          '✗ 和 Mochi 的亲密还没到「信任」：一起钓鱼、聊天、摸摸它',
        ],
      },
    ]);
    // Mochi herself and the city miss nothing.
    expect(visible('#breed-self')).toBe(false);
    expect(visible('#breed-city')).toBe(false);
    expect(game.session.lastCommand()).toBeNull();
    expect(game.world()).toEqual(before);
  });

  it('follows the cat picked in the roster', () => {
    const game = openGame({ storage: family() });
    const pepper = game.world().cats[1]!;
    openCats('roster');
    click('#breed-open');
    click(`[data-cat-id="${pepper.id}"]`);
    expect(text('#breed-open')).toBe('Pepper 和谁生小猫…');
    expect(listed().map((cat) => cat.lines)).toEqual([
      ['✓ 可以'],
      [
        '✗ Mochi 现在不够开心（平静）：摸摸它，或者送它喜欢的鱼',
        '✗ 和 Mochi 的亲密还没到「信任」：一起钓鱼、聊天、摸摸它',
      ],
    ]);
    expect(visible('#breed-self')).toBe(true);
    expect(text('#breed-self')).toBe(
      'Pepper 自己：✗ Pepper 现在不够开心（平静）：摸摸它，或者送它喜欢的鱼',
    );
  });

  it('keeps its elements while the city clock runs (design.md 10.2)', () => {
    const game = openGame({ storage: family() });
    openCats('roster');
    click('#breed-open');
    const elements = () => [
      $('#breed-open'),
      ...Array.from(document.querySelectorAll('#breed-list li')),
    ];
    const before = elements();
    for (let minute = 0; minute < 5; minute++)
      expect(
        game.session.execute({ type: 'ADVANCE_TIME', minutes: 1 }).ok,
      ).toBe(true);
    const after = elements();
    expect(after).toHaveLength(before.length);
    expect(after.every((element, index) => element === before[index])).toBe(
      true,
    );
    expect(before.every((element) => element.isConnected)).toBe(true);
  });

  it('opens and closes by keyboard alone', () => {
    openGame({ storage: family() });
    pressEnter('#city-tab-cats');
    pressEnter('#cats-tab-roster');
    pressEnter('#breed-open');
    expect(visible('#breed-list')).toBe(true);
    expect(rows()).toHaveLength(2);
    pressEnter('#breed-open');
    expect(visible('#breed-list')).toBe(false);
    expect($('#breed-open').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe($('#breed-open'));
  });
});
