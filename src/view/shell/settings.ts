import './settings.css';
import type { PlaceState } from './place';

/** The settings sheet's words: one gear on every page (2026-09-30). */
export const SETTINGS_COPY = {
  title: '设置',
  close: '关闭设置',
  /** Settings for the whole device, the same on every page. */
  common: '公共设置',
  /** Settings of the page the sheet was opened on; a page without any shows none. */
  page: '本页设置',
} as const;

/** A rounded gear in the text colour: a ring, a hub and eight teeth. */
const GEAR_ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-linecap="round">' +
  '<circle cx="12" cy="12" r="6" stroke-width="2"/><circle cx="12" cy="12" r="2.2" stroke-width="2"/>' +
  '<path stroke-width="3" d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6"/></svg>';

/**
 * The one settings gear (2026-09-30): at the right under the scene bar, the same element
 * in the same place on every page. It opens a modal sheet with the common settings (sound
 * and haptics, labelled and run by their own modules) and a section for the page it was
 * opened on, which that page's module fills and shows. Modules that the open sheet covers
 * follow it through `subscribe`; a change of page closes it.
 */
export function mountSettings(deps: {
  place: PlaceState;
  /** The gear and its sheet follow this element: right after the scene bar for Tab. */
  after: HTMLElement;
}) {
  const words = SETTINGS_COPY;
  const gear = document.createElement('button');
  gear.id = 'settings-gear';
  gear.type = 'button';
  gear.className = 'settings-gear';
  gear.setAttribute('aria-label', words.title);
  gear.setAttribute('aria-haspopup', 'dialog');
  gear.setAttribute('aria-controls', 'settings-sheet');
  gear.setAttribute('aria-expanded', 'false');
  gear.innerHTML = GEAR_ICON;

  const shade = document.createElement('button');
  shade.id = 'settings-shade';
  shade.type = 'button';
  shade.tabIndex = -1;
  shade.setAttribute('aria-label', words.close);
  shade.hidden = true;
  const sheet = document.createElement('section');
  sheet.id = 'settings-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'settings-title');
  sheet.hidden = true;
  sheet.innerHTML =
    `<div class="settings-heading"><h2 id="settings-title">${words.title}</h2><button id="settings-close" type="button" aria-label="${words.close}">✕</button></div>` +
    `<section id="settings-common" class="settings-section" aria-labelledby="settings-common-title"><h3 id="settings-common-title">${words.common}</h3><div class="settings-toggles"><button id="sound-toggle" type="button" aria-pressed="false"></button><button id="haptics-toggle" type="button" aria-pressed="false"></button></div></section>` +
    `<section id="settings-page" class="settings-section" aria-labelledby="settings-page-title" hidden><h3 id="settings-page-title">${words.page}</h3></section>`;
  deps.after.after(gear, shade, sheet);
  const $ = <T extends HTMLElement = HTMLButtonElement>(id: string) =>
    sheet.querySelector<T>(`#${id}`)!;
  const close = $('settings-close');

  let open = false;
  const listeners = new Set<(open: boolean) => void>();
  const set = (next: boolean) => {
    if (next === open) return;
    open = next;
    gear.setAttribute('aria-expanded', String(open));
    sheet.hidden = !open;
    shade.hidden = !open;
    for (const listener of listeners) listener(open);
  };
  /** Closed by the player: focus returns to the gear. */
  const dismiss = () => {
    set(false);
    gear.focus({ preventScroll: true });
  };
  gear.addEventListener('click', () => {
    set(true);
    close.focus({ preventScroll: true });
  });
  close.addEventListener('click', dismiss);
  shade.addEventListener('click', dismiss);
  // Captured: the sheet is on top, so Escape closes it and not a panel under it.
  document.addEventListener(
    'keydown',
    (event) => {
      if (!open) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        dismiss();
        return;
      }
      if (event.key !== 'Tab') return;
      // The sheet is modal: Tab stays on its controls, round from the last to the first.
      const stops = Array.from(sheet.querySelectorAll('button')).filter(
        (button) => !button.disabled && !button.closest('[hidden]'),
      );
      const at = stops.indexOf(document.activeElement as HTMLButtonElement);
      const next = at + (event.shiftKey ? -1 : 1);
      event.preventDefault();
      stops[at === -1 ? 0 : (next + stops.length) % stops.length]!.focus({
        preventScroll: true,
      });
    },
    true,
  );
  // The page's own section changes with the page: the sheet does not stay open over it.
  deps.place.subscribe(() => set(false));

  return {
    /** Hears the sheet open and close, inside the tap that did it. */
    subscribe(listener: (open: boolean) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Closes the sheet, with the focus back on the gear. */
    close: dismiss,
    /** The common switches; their modules label them and run them. */
    sound: $('sound-toggle'),
    haptics: $('haptics-toggle'),
    /** The page's own section, filled and shown by the page that has settings. */
    page: $<HTMLElement>('settings-page'),
  };
}
export type SettingsSheet = ReturnType<typeof mountSettings>;
