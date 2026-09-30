import { FISH, fishStars } from '../../content/fishing';
import { SCREEN_COPY } from './screen';
import './collections.css';

/** Paginate the rendered collection. Navigation never changes inventory or world state. */
export function mountFishingCollections(
  /** The fishing markup's elements by id. */
  get: (id: string) => HTMLElement,
) {
  const bag = get('fish-bag') as HTMLDetailsElement;
  const bagPanel = get('river-panel-bag');
  const supplies = (get('fish-supply-detail') ??
    bagPanel.querySelector('details:not(#fish-bag)')) as HTMLDetailsElement;
  supplies.id = 'fish-supply-detail';
  bag.open = true;
  supplies.open = true;
  const segments = document.createElement('div');
  segments.className = 'collection-segments';
  segments.setAttribute('aria-label', '鱼篓分类');
  segments.innerHTML =
    '<button id="bag-tab-fish" aria-pressed="true">鱼获</button><button id="bag-tab-supplies" aria-pressed="false">补给与垃圾</button>';
  bagPanel.prepend(segments);
  const fishTab = segments.querySelector<HTMLElement>('#bag-tab-fish')!;
  const suppliesTab = segments.querySelector<HTMLElement>('#bag-tab-supplies')!;
  const pager = document.createElement('div');
  pager.className = 'collection-pager';
  pager.innerHTML =
    '<button id="bag-prev" aria-label="上一页鱼获">← 上页</button><span id="bag-page" aria-live="polite"></span><button id="bag-next" aria-label="下一页鱼获">下页 →</button>';
  bag.append(pager);
  const bagPage = pager.querySelector<HTMLElement>('#bag-page')!;
  const bagPrev = pager.querySelector<HTMLButtonElement>('#bag-prev')!;
  const bagNext = pager.querySelector<HTMLButtonElement>('#bag-next')!;
  const atlas = get('fish-atlas') as HTMLDetailsElement;
  atlas.open = true;
  const speciesChoice = document.createElement('label');
  speciesChoice.className = 'atlas-picker';
  speciesChoice.htmlFor = 'atlas-species';
  speciesChoice.append('选择鱼种');
  const species = document.createElement('select');
  species.id = 'atlas-species';
  species.append(
    ...FISH.map(
      (fish) =>
        new Option(
          `${fishStars(fish.stars)} ${SCREEN_COPY.atlas.unknown}`,
          fish.id,
        ),
    ),
  );
  speciesChoice.append(species);
  get('atlas-list').before(speciesChoice);
  const atlasPager = document.createElement('div');
  atlasPager.className = 'collection-pager';
  atlasPager.innerHTML =
    '<button id="atlas-prev" aria-label="上一种鱼">← 上一种</button><span id="atlas-page" aria-live="polite"></span><button id="atlas-next" aria-label="下一种鱼">下一种 →</button>';
  atlas.append(atlasPager);
  const atlasPage = atlasPager.querySelector<HTMLElement>('#atlas-page')!;
  const atlasPrev = atlasPager.querySelector<HTMLButtonElement>('#atlas-prev')!;
  const atlasNext = atlasPager.querySelector<HTMLButtonElement>('#atlas-next')!;
  let page = 0;
  let supplyMode = false;
  const refresh = () => {
    const rows = Array.from(
      get('fish-inventory').querySelectorAll<HTMLElement>('.fish-item'),
    );
    const pages = Math.max(1, Math.ceil(rows.length / 4));
    page = Math.min(page, pages - 1);
    rows.forEach((row, index) => {
      row.hidden = Math.floor(index / 4) !== page;
    });
    bagPage.textContent = `${page + 1} / ${pages} 页`;
    bagPrev.disabled = page === 0;
    bagNext.disabled = page + 1 === pages;
    bag.hidden = supplyMode;
    supplies.hidden = !supplyMode;
    fishTab.setAttribute('aria-pressed', String(!supplyMode));
    suppliesTab.setAttribute('aria-pressed', String(supplyMode));
    const index = Math.max(
      0,
      FISH.findIndex((fish) => fish.id === species.value),
    );
    get('atlas-list')
      .querySelectorAll<HTMLElement>('.fish-entry')
      .forEach((card) => {
        card.hidden = card.dataset.species !== species.value;
      });
    // The picker names a species only once it is caught, as its entry does.
    FISH.forEach((fish, index) => {
      const caught =
        get('atlas-list').querySelector<HTMLElement>(
          `[data-species="${fish.id}"]`,
        )?.dataset.discovered === 'true';
      const label = `${fishStars(fish.stars)} ${caught ? fish.name : SCREEN_COPY.atlas.unknown}`;
      const option = species.options[index]!;
      if (option.text !== label) option.text = label;
    });
    atlasPage.textContent = `${index + 1} / ${FISH.length} 种`;
    atlasPrev.disabled = index === 0;
    atlasNext.disabled = index === FISH.length - 1;
  };
  fishTab.addEventListener('click', () => {
    supplyMode = false;
    refresh();
  });
  suppliesTab.addEventListener('click', () => {
    supplyMode = true;
    refresh();
  });
  bagPrev.addEventListener('click', () => {
    page = Math.max(0, page - 1);
    refresh();
  });
  bagNext.addEventListener('click', () => {
    page++;
    refresh();
  });
  species.addEventListener('change', refresh);
  for (const [button, delta] of [
    [atlasPrev, -1],
    [atlasNext, 1],
  ] as const)
    button.addEventListener('click', () => {
      const index = FISH.findIndex((fish) => fish.id === species.value);
      species.value =
        FISH[Math.max(0, Math.min(FISH.length - 1, index + delta))]!.id;
      refresh();
    });
  refresh();
  return { refresh };
}
