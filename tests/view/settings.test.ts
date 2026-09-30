import { describe, expect, it } from 'vitest';
import { $, click, key, openGame, text, visible } from '../helpers/view-rig';
import { SETTINGS_COPY } from '../../src/view/shell/settings';
import { PETTING } from '../../src/content/petting';
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

const PETTING_TICK_MS = 1000 / PETTING.ticksPerSecond;
/** The selected cat's petting screen, from the cats panel of the page on screen. */
function startPetting() {
  openCats('roster');
  click('#pet-cat');
  expect(visible('#petting')).toBe(true);
}

describe('the settings gear over the petting screen', () => {
  it('is the same gear, reached by Tab after the screen’s ✕; Escape there still closes the screen', () => {
    openGame();
    const gear = $(GEAR);
    startPetting();
    expect($(GEAR)).toBe(gear);
    expect(visible(GEAR)).toBe(true);
    // The screen is a modal dialog: it owns the gear while it is open.
    expect($('#petting').getAttribute('aria-owns')).toBe('settings-gear');
    $('#petting-close').focus();
    key('keydown', 'Tab');
    expect(document.activeElement).toBe(gear);
    key('keydown', 'Tab');
    expect(document.activeElement).toBe($('[data-spot="HEAD"]'));
    key('keydown', 'Tab', true);
    expect(document.activeElement).toBe(gear);
    key('keydown', 'Tab', true);
    expect(document.activeElement).toBe($('#petting-close'));
    // From the gear, Escape leaves the screen as from anywhere on it.
    gear.focus();
    key('keydown', 'Escape');
    expect(visible('#petting')).toBe(false);
    expect($('#petting').hasAttribute('aria-owns')).toBe(false);
  });

  it('opened in a round, it holds the round: the countdown and the purr wait, strokes land nowhere', () => {
    const game = openGame();
    startPetting();
    game.wait(10 * PETTING_TICK_MS);
    const time = text('#petting-time');
    const purr = $('#petting-cat').dataset.purr;
    const meter = $('#petting-meter').getAttribute('aria-valuenow');
    openSettings();
    // Longer than the whole round: nothing moves under the sheet.
    game.wait(PETTING.roundTicks * PETTING_TICK_MS);
    expect(visible('#petting-result')).toBe(false);
    expect(text('#petting-time')).toBe(time);
    for (let tick = 0; tick < PETTING.purr.periodTicks; tick++) {
      game.wait(PETTING_TICK_MS);
      expect($('#petting-cat').dataset.purr).toBe(purr);
    }
    click('[data-spot="CHIN"]');
    expect($('#petting-meter').getAttribute('aria-valuenow')).toBe(meter);
    // Escape closes the sheet only; the round goes on from where it stopped.
    key('keydown', 'Escape');
    expect(visible(SHEET)).toBe(false);
    expect(visible('#petting')).toBe(true);
    game.wait(PETTING.roundTicks * PETTING_TICK_MS - 10 * PETTING_TICK_MS - 1);
    expect(visible('#petting-result')).toBe(false);
    game.wait(PETTING_TICK_MS + 1);
    expect(visible('#petting-result')).toBe(true);
  });

  it('over the river it holds the common settings only; back on the river, the river’s own too', () => {
    const game = openGame({ audio: true });
    enterRiver(game);
    startPetting();
    openSettings();
    for (const control of COMMON) expect(visible(control), control).toBe(true);
    expect(visible('#settings-page')).toBe(false);
    closeSettings();
    click('#petting-close');
    openSettings();
    expect(visible('#settings-page')).toBe(true);
    for (const control of RIVER) expect(visible(control), control).toBe(true);
  });
});
