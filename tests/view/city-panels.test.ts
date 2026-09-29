import { describe, expect, it } from 'vitest';
import { $, click, openGame, text, visible } from '../helpers/view-rig';

describe('city panels', () => {
  it('the clock speed cycles 1× → 2× → 4× → 1×, is remembered, and minigames run at 1×', () => {
    const game = openGame();
    const speed = () => $<HTMLButtonElement>('#clock-speed');
    expect(text('#clock-speed')).toContain('1×');
    for (const label of ['2×', '4×', '1×', '2×', '4×']) {
      click('#clock-speed');
      expect(text('#clock-speed')).toContain(label);
    }
    game.reload();
    expect(text('#clock-speed')).toContain('4×');
    expect(speed().disabled).toBe(false);
    // Entering the river (a minigame) drops to 1× and locks the control.
    click('#visit-river');
    expect($('#visit-river').getAttribute('aria-pressed')).toBe('true');
    expect(speed().disabled).toBe(true);
    expect(text('#clock-speed')).toContain('1×');
    expect(text('#clock-speed')).toContain('钓鱼');
    click('#visit-city');
    expect(speed().disabled).toBe(false);
    expect(text('#clock-speed')).toContain('1×');
    game.reload();
    expect(text('#clock-speed')).toContain('1×');
  });

  it('outing lists waterways with their conditions; chat has no second fishing entry', () => {
    const game = openGame();
    click('#city-tab-cats');
    const fishingButtons = Array.from(
      document.querySelectorAll('button'),
    ).filter(
      (button) =>
        visible(button) &&
        /去钓鱼/.test(button.getAttribute('aria-label') ?? button.textContent),
    );
    expect(fishingButtons).toHaveLength(0);
    click('#city-tab-outing');
    expect($('#city-tab-outing').getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelectorAll('[data-outing-spot]')).toHaveLength(4);
    expect(text('#city-panel-outing')).toContain('家门口池塘');
    expect(text('#city-panel-outing')).toContain('钓技');
    const before = game.world();
    click('[data-outing-spot="REEDS"]');
    expect(visible('#river-tools')).toBe(false);
    expect(text('#city-selection-label')).toContain('芦苇河湾');
    expect($<HTMLButtonElement>('#walk-to-waterway').disabled).toBe(true);
    expect(text('#city-action-reason')).toContain('钓技');
    expect(game.world()).toEqual(before);
    click('#city-tab-outing');
    click('[data-outing-spot="POND"]');
    expect(visible('#begin-fishing')).toBe(true);
    // Pepper is invited from the cats page, never from the river roster.
    click('#begin-fishing');
    expect($('#visit-river').getAttribute('aria-pressed')).toBe('true');
    expect(visible('#invite-pepper')).toBe(false);
  });
});
