import './settings.css';
import { SCREEN_COPY, type FishingScreen } from './screen';
import type { FishingViewStore, Preference } from './view-state';
import type { SettingsSheet } from '../shell/settings';

const WORDS = SCREEN_COPY.settings;

/**
 * The river's section of the settings sheet (spec 034): the fishing mode and calibration.
 * The sheet is the shell's, opened with the one gear every page shows; while it is open
 * it covers the river's play. What shows is decided by `fishingScreen`; this applies it
 * and reports taps.
 */
export function mountFishingSettings(deps: {
  view: FishingViewStore;
  sheet: Pick<SettingsSheet, 'subscribe' | 'close' | 'page'>;
  /** A fishing mode picked in the sheet; choosing motion asks inside this tap. */
  choose: (mode: Preference) => void;
}) {
  const { view, sheet } = deps;
  const section = sheet.page;
  section.insertAdjacentHTML(
    'beforeend',
    `<p id="settings-mode-label" class="river-settings-label">${WORDS.mode}</p>` +
      `<div class="river-settings-modes" role="group" aria-labelledby="settings-mode-label" aria-describedby="settings-mode-note"><button id="settings-mode-motion" type="button" aria-pressed="false">${WORDS.motion}</button><button id="settings-mode-buttons" type="button" aria-pressed="false">${WORDS.buttons}</button></div>` +
      '<p id="settings-mode-note" class="river-settings-note" hidden></p>' +
      `<button id="settings-calibrate" type="button" hidden>${SCREEN_COPY.calibrate.button}</button>`,
  );
  const $ = <T extends HTMLElement = HTMLButtonElement>(id: string) =>
    section.querySelector<T>(`#${id}`)!;
  const modes = {
    motion: $('settings-mode-motion'),
    buttons: $('settings-mode-buttons'),
  };
  const note = $<HTMLElement>('settings-mode-note');
  const calibrate = $('settings-calibrate');

  // The open sheet covers play, from inside the tap that opens it: that tap asks nothing.
  sheet.subscribe((open) => view.dispatch({ type: 'settings', open }));
  for (const mode of ['motion', 'buttons'] as const)
    modes[mode].addEventListener('click', () => deps.choose(mode));
  // Calibration starts on the water: the sheet closes first.
  calibrate.addEventListener('click', () => {
    sheet.close();
    view.dispatch({ type: 'calibrating', on: true });
  });

  return {
    /** Applies the screen model's settings; decides nothing itself. */
    apply(model: FishingScreen['settings']) {
      section.hidden = !model.page;
      for (const mode of ['motion', 'buttons'] as const) {
        modes[mode].setAttribute(
          'aria-pressed',
          String(model.mode[mode].pressed),
        );
        modes[mode].disabled = model.mode[mode].disabled;
      }
      note.textContent = model.mode.note ?? '';
      note.hidden = !model.mode.note;
      calibrate.hidden = !model.calibrate;
    },
  };
}
