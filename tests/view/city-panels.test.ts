import { describe, expect, it } from 'vitest';
import { CITY_START } from '../../src/content/city';
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
    // New companions are invited from the cats page, never from the river roster.
    click('#begin-fishing');
    expect($('#visit-river').getAttribute('aria-pressed')).toBe('true');
    expect(visible('#invite-open')).toBe(false);
  });

  // In the browser the clock changes the world every second (pages.spec.ts lost its
  // click to a card rebuilt under it); a player's tap spans press and release.
  describe('the action card keeps its buttons', () => {
    const buttons = () =>
      Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          '#city-action-buttons button',
        ),
      );
    const tick = (game: ReturnType<typeof openGame>) =>
      expect(
        game.session.execute({ type: 'ADVANCE_TIME', minutes: 1 }).ok,
      ).toBe(true);
    /** The guide selects the plot it recommends. */
    const openPlot = () => {
      click('#city-tab-guide');
      click('#city-action');
      expect(buttons().map((button) => button.id)).toEqual([
        'build-cat_cafe',
        'build-cat_apartment',
        'build-cat_salon',
        'place-road',
      ]);
    };

    it('through clock ticks that do not change the card', () => {
      const game = openGame();
      openPlot();
      const before = buttons();
      before[1]!.focus();
      for (let second = 0; second < 5; second++) tick(game);
      expect(game.world().minute).toBeGreaterThan(CITY_START.minute);
      const after = buttons();
      expect(after).toHaveLength(before.length);
      after.forEach((button, index) => expect(button).toBe(before[index]));
      expect(before.every((button) => button.isConnected)).toBe(true);
      expect(document.activeElement).toBe(before[1]);
      // The kept buttons still work.
      click('#build-cat_apartment');
      expect(game.world().buildings).toHaveLength(1);
    });

    it('and updates them in place when only a label or a reason changes', () => {
      const game = openGame();
      openPlot();
      click('#build-cat_apartment');
      expect(buttons().map((button) => button.id)).toEqual([
        'move-building',
        'assign-home-mochi',
      ]);
      const [move, moveIn] = buttons();
      expect(moveIn!.disabled).toBe(false);
      click('#assign-home-mochi');
      // Mochi lives here now: the same button, disabled, with its reason.
      expect(buttons()).toEqual([move, moveIn]);
      expect(buttons()[1]).toBe(moveIn);
      expect(moveIn!.disabled).toBe(true);
      expect(moveIn!.isConnected).toBe(true);
      expect(text('#city-action-reason')).not.toBe('');
      tick(game);
      expect(buttons()[1]).toBe(moveIn);
    });

    it('and shows other buttons for another card, each doing its own work', () => {
      const game = openGame();
      openPlot();
      const plot = buttons();
      click('#build-cat_cafe');
      expect(buttons().map((button) => button.id)).toEqual(['move-building']);
      expect(plot.every((button) => !button.isConnected)).toBe(true);
      expect(game.world().buildings.map((building) => building.type)).toEqual([
        'CAT_CAFE',
      ]);
      click('#cancel-city-action');
      expect(visible('#city-action-card')).toBe(false);
    });
  });
});
