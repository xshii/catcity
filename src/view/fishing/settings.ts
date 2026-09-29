import './settings.css';
import { WATER_VIEW } from '../art/water-view';
import { SCREEN_COPY, type FishingScreen } from './screen';
import type { FishingViewStore, Preference } from './view-state';

const WORDS = SCREEN_COPY.settings;
/** The gear's gap from the open water's top-left corner. */
const INSET_PX = 4;
/** A rounded gear in the text colour: a ring, a hub and eight teeth. */
const GEAR_ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-linecap="round">' +
  '<circle cx="12" cy="12" r="6" stroke-width="2"/><circle cx="12" cy="12" r="2.2" stroke-width="2"/>' +
  '<path stroke-width="3" d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6"/></svg>';

/**
 * The river's settings (spec 034): a gear over the water opens a small sheet with the
 * fishing mode, calibration, sound and haptics. What shows is decided by `fishingScreen`;
 * this applies it and reports taps. Sound and haptics keep their own modules, which are
 * handed the sheet's buttons.
 */
export function mountFishingSettings(deps: {
  view: FishingViewStore;
  /** The canvas box: the gear sits at the open water's top-left corner. */
  plane: HTMLElement;
  /** The river screen, which the sheet and its shade cover. */
  stage: HTMLElement;
  /** A fishing mode picked in the sheet; choosing motion asks inside this tap. */
  choose: (mode: Preference) => void;
}) {
  const { view } = deps;
  const gear = document.createElement('button');
  gear.id = 'river-settings';
  gear.type = 'button';
  gear.className = 'river-settings-gear';
  gear.setAttribute('aria-label', WORDS.title);
  gear.setAttribute('aria-haspopup', 'dialog');
  gear.setAttribute('aria-controls', 'river-settings-sheet');
  gear.innerHTML = GEAR_ICON;
  // Where the water plane starts on the square canvas, as the motion overlay is placed.
  const { left, top } = WATER_VIEW.plane;
  gear.style.left = `calc(${left * 100}% + ${INSET_PX}px)`;
  gear.style.top = `calc(${top * 100}% + ${INSET_PX}px)`;
  deps.plane.append(gear);

  const shade = document.createElement('button');
  shade.id = 'river-settings-shade';
  shade.type = 'button';
  shade.tabIndex = -1;
  shade.setAttribute('aria-label', WORDS.close);
  shade.hidden = true;
  const sheet = document.createElement('section');
  sheet.id = 'river-settings-sheet';
  sheet.className = 'river-settings';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-labelledby', 'river-settings-title');
  sheet.hidden = true;
  sheet.innerHTML =
    `<div class="river-settings-heading"><h2 id="river-settings-title">${WORDS.title}</h2><button id="river-settings-close" type="button" aria-label="${WORDS.close}">✕</button></div>` +
    `<p id="settings-mode-label" class="river-settings-label">${WORDS.mode}</p>` +
    `<div class="river-settings-modes" role="group" aria-labelledby="settings-mode-label" aria-describedby="settings-mode-note"><button id="settings-mode-motion" type="button" aria-pressed="false">${WORDS.motion}</button><button id="settings-mode-buttons" type="button" aria-pressed="false">${WORDS.buttons}</button></div>` +
    '<p id="settings-mode-note" class="river-settings-note" hidden></p>' +
    `<button id="settings-calibrate" type="button" hidden>${SCREEN_COPY.calibrate.button}</button>` +
    '<div class="river-settings-toggles"><button id="sound-toggle" type="button" aria-pressed="false"></button><button id="haptics-toggle" type="button" aria-pressed="false"></button></div>';
  deps.stage.append(shade, sheet);
  const $ = <T extends HTMLElement = HTMLButtonElement>(id: string) =>
    sheet.querySelector<T>(`#${id}`)!;
  const modes = {
    motion: $('settings-mode-motion'),
    buttons: $('settings-mode-buttons'),
  };
  const note = $<HTMLElement>('settings-mode-note');
  const calibrate = $('settings-calibrate');
  const close = $('river-settings-close');

  /** Closed by the player: focus returns to the gear. */
  const dismiss = () => {
    view.dispatch({ type: 'settings', open: false });
    gear.focus({ preventScroll: true });
  };
  gear.addEventListener('click', () => {
    view.dispatch({ type: 'settings', open: true });
    close.focus({ preventScroll: true });
  });
  close.addEventListener('click', dismiss);
  shade.addEventListener('click', dismiss);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && view.get().settingsOpen) dismiss();
  });
  for (const mode of ['motion', 'buttons'] as const)
    modes[mode].addEventListener('click', () => deps.choose(mode));
  // Calibration starts on the water: the sheet closes as it begins.
  calibrate.addEventListener('click', () => {
    view.dispatch({ type: 'calibrating', on: true });
    gear.focus({ preventScroll: true });
  });

  return {
    sound: $('sound-toggle'),
    haptics: $('haptics-toggle'),
    /** Applies the screen model's settings; decides nothing itself. */
    apply(model: FishingScreen['settings']) {
      gear.hidden = !model.gear;
      gear.setAttribute('aria-expanded', String(model.open));
      sheet.hidden = !model.open;
      shade.hidden = !model.open;
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
