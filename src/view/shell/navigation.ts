import type { Place, PlaceState } from '../common/place';
// Both scenes share the cats panel: roster, chat and memories (spec 031).
const cityPanels = [
  ['guide', '指引', '⌂'],
  ['cats', '猫咪', '♡'],
  ['outing', '出游', '↗'],
] as const;
const riverPanels = [
  ['gear', '钓具', '⌁'],
  ['bag', '鱼篓', '▱'],
  ['atlas', '图鉴', '▤'],
  ['cats', '猫咪', '♡'],
] as const;
type Panel = (typeof cityPanels | typeof riverPanels)[number][0];

/** Scene-local menus share content without navigating or changing the world. */
/** `toggled` runs when a panel opens or closes: fishing input pauses, the scene redraws. */
export function mountSceneNavigation(places: PlaceState, toggled: () => void) {
  const get = (id: string) => document.getElementById(id)!;
  const shell = document.querySelector<HTMLElement>('.shell')!;
  const root = get('angling');
  const sheet = get('river-tools');
  const cityOnly = ['guide', 'outing'] as const;
  const panelId = (id: Panel) =>
    id === 'cats'
      ? 'panel-cats'
      : `${(cityOnly as readonly Panel[]).includes(id) ? 'city' : 'river'}-panel-${id}`;
  for (const id of cityOnly) {
    const panel = document.createElement('section');
    panel.id = panelId(id);
    panel.hidden = true;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `city-tab-${id}`);
    sheet.append(panel);
  }
  get('city-panel-guide').append(get('city-guide'), get('city-save'));
  const shade = document.createElement('button');
  shade.id = 'river-tools-shade';
  shade.type = 'button';
  shade.tabIndex = -1;
  shade.setAttribute('aria-label', '收起面板，返回场景');
  shade.hidden = true;
  sheet.before(shade);
  let place: Place = places.get();
  let selected: Panel | null = null;
  const navs = (['city', 'river'] as const).map((scene) => {
    const entries = scene === 'city' ? cityPanels : riverPanels;
    const nav = document.createElement('nav');
    nav.id = `${scene}-tools-nav`;
    nav.className = 'scene-tools-nav';
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', scene === 'city' ? '小城功能' : '钓点功能');
    nav.innerHTML = entries
      .map(
        ([id, name, icon]) =>
          `<button id="${scene}-tab-${id}" role="tab" aria-controls="${panelId(id)}" aria-expanded="false" aria-selected="false"><span aria-hidden="true">${icon}</span>${name}</button>`,
      )
      .join('');
    root.prepend(nav);
    entries.forEach(([id]) => {
      get(`${scene}-tab-${id}`).addEventListener('click', () => {
        if (place !== scene) return;
        if (selected === id) close();
        else open(id);
      });
    });
    const buttons = Array.from(nav.querySelectorAll('button'));
    buttons.forEach((button, index) =>
      button.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
          return;
        event.preventDefault();
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (index +
                  (event.key === 'ArrowRight' ? 1 : -1) +
                  buttons.length) %
                buttons.length;
        buttons[next]!.focus({ preventScroll: true });
      }),
    );
    return { scene, nav, entries };
  });
  const refresh = () => {
    const next = places.get();
    if (next !== place) {
      selected = null;
      place = next;
      get(`visit-${place}`).focus({ preventScroll: true });
    }
    const river = place === 'river';
    shell.classList.toggle('river-screen', river);
    // The notice shows over an open panel (layout.css).
    shell.classList.toggle('panel-open', selected !== null);
    root.hidden = false;
    sheet.hidden = selected === null;
    shade.hidden = sheet.hidden;
    get('river-tools-close').textContent = river ? '返回钓鱼 ↓' : '返回小城 ↓';
    get('river-tools-close').setAttribute(
      'aria-label',
      river ? '返回钓鱼' : '返回小城',
    );
    for (const { scene, nav, entries } of navs) {
      nav.hidden = scene !== place;
      for (const [id] of entries) {
        const active = id === selected && scene === place;
        get(`${scene}-tab-${id}`).setAttribute('aria-selected', String(active));
        get(`${scene}-tab-${id}`).setAttribute('aria-expanded', String(active));
      }
    }
    for (const id of new Set<Panel>(
      [...cityPanels, ...riverPanels].map(([id]) => id),
    ))
      get(panelId(id)).hidden = id !== selected;
    get('panel-cats').setAttribute('aria-labelledby', `${place}-tab-cats`);
  };
  function close() {
    selected = null;
    refresh();
    toggled();
  }
  const dismiss = () => {
    const previous = selected;
    close();
    if (previous)
      get(`${place}-tab-${previous}`).focus({ preventScroll: true });
  };
  get('river-tools-close').addEventListener('click', dismiss);
  shade.addEventListener('click', dismiss);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selected) dismiss();
  });
  /** Show a panel of the current scene; opening pauses fishing input. */
  function open(id: Panel) {
    if (selected === id) return;
    selected = id;
    const entries = place === 'city' ? cityPanels : riverPanels;
    get('river-tools-title').textContent =
      entries.find(([key]) => key === id)?.[1] ?? '';
    if (id === 'atlas') (get('fish-atlas') as HTMLDetailsElement).open = true;
    toggled();
    refresh();
  }
  places.subscribe(refresh);
  refresh();
  return { refresh, close, open, isOpen: () => selected !== null };
}
