import { describe, expect, it } from 'vitest';
import { $, click, key, openGame, text, visible } from '../helpers/view-rig';
import { SETTINGS_COPY } from '../../src/view/shell/settings';
import {
  backToCity,
  closeSettings,
  enterRiver,
  openCats,
  openSettings,
} from '../helpers/view-player';

const GEAR = '#settings-gear';
const SHEET = '#settings-sheet';
/** Space or Enter on the focused button, as a browser turns it into a click. */
const press = () => (document.activeElement as HTMLElement).click();
const COMMON = ['#sound-toggle', '#haptics-toggle'];
const RIVER = ['#settings-mode-motion', '#settings-mode-buttons'];

describe('one settings gear on every page (2026-09-30)', () => {
  it('the city and the river show the same gear, which opens the same sheet', () => {
    const game = openGame();
    const gear = $(GEAR);
    const sheet = $(SHEET);
    expect(document.querySelectorAll(GEAR)).toHaveLength(1);
    expect(visible(GEAR)).toBe(true);
    expect(gear.getAttribute('aria-label')).toBe(SETTINGS_COPY.title);
    openSettings();
    closeSettings();
    enterRiver(game);
    expect($(GEAR)).toBe(gear);
    expect(visible(GEAR)).toBe(true);
    openSettings();
    expect($(SHEET)).toBe(sheet);
    closeSettings();
    backToCity();
    // Neither a change of page nor the clock builds it again.
    for (let tick = 0; tick < 5; tick++)
      game.session.execute({ type: 'ADVANCE_TIME', minutes: 1 });
    expect($(GEAR)).toBe(gear);
    expect(visible(GEAR)).toBe(true);
  });

  it('in the city it holds the common settings only; on the river the river’s own as well', () => {
    const game = openGame({ audio: true });
    openSettings();
    expect(text('#settings-common h3')).toBe(SETTINGS_COPY.common);
    for (const control of COMMON) expect(visible(control), control).toBe(true);
    expect(visible('#settings-page')).toBe(false);
    for (const control of [...RIVER, '#settings-calibrate'])
      expect(visible(control), control).toBe(false);
    closeSettings();
    enterRiver(game);
    openSettings();
    expect(text('#settings-page h3')).toBe(SETTINGS_COPY.page);
    for (const control of [...COMMON, ...RIVER])
      expect(visible(control), control).toBe(true);
  });

  it('a common setting changed on one page reads the same on the other', () => {
    const game = openGame({ audio: true });
    openSettings();
    click('#sound-toggle');
    click('#haptics-toggle');
    expect(text('#sound-toggle')).toBe('音效：关');
    expect(text('#haptics-toggle')).toBe('震动：关');
    closeSettings();
    enterRiver(game);
    openSettings();
    expect(text('#sound-toggle')).toBe('音效：关');
    expect(text('#haptics-toggle')).toBe('震动：关');
    click('#sound-toggle');
    click('#haptics-toggle');
    closeSettings();
    backToCity();
    openSettings();
    expect(text('#sound-toggle')).toBe('音效：开');
    expect(text('#haptics-toggle')).toBe('震动：开');
  });

  it('opens and closes by keyboard alone, on either page', () => {
    const game = openGame({ audio: true });
    for (const page of ['city', 'river']) {
      if (page === 'river') enterRiver(game);
      // Tabbed to the gear, Enter opens it with the focus on its ✕.
      $(GEAR).focus();
      press();
      expect(visible(SHEET), page).toBe(true);
      expect(document.activeElement).toBe($('#settings-close'));
      key('keydown', 'Tab');
      expect(document.activeElement).toBe($('#sound-toggle'));
      key('keydown', 'Escape');
      expect(visible(SHEET), page).toBe(false);
      expect(document.activeElement).toBe($(GEAR));
    }
  });

  it('opens over an open panel; Escape closes the settings first, then the panel', () => {
    openGame();
    openCats();
    expect(visible('#river-tools')).toBe(true);
    openSettings();
    key('keydown', 'Escape');
    expect(visible(SHEET)).toBe(false);
    expect(visible('#river-tools')).toBe(true);
    key('keydown', 'Escape');
    expect(visible('#river-tools')).toBe(false);
  });

  it('closes when the page changes under it, as when a cat walks off the shore', () => {
    const game = openGame();
    enterRiver(game);
    openSettings();
    // The scene switch is under the sheet's shade; a world change can move the page.
    click('#visit-city');
    expect(visible(SHEET)).toBe(false);
    expect($(GEAR).getAttribute('aria-expanded')).toBe('false');
    expect(visible(GEAR)).toBe(true);
  });
});
