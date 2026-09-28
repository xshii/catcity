import { FISH, fishStars } from '../../content/fishing';
import './collections.css';

/** Paginate the rendered collection. Navigation never changes inventory or world state. */
export function mountFishingCollections() {
  const get = (id: string) => document.getElementById(id)!;
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
  const pager = document.createElement('div');
  pager.className = 'collection-pager';
  pager.innerHTML =
    '<button id="bag-prev" aria-label="上一页鱼获">← 上页</button><span id="bag-page" aria-live="polite"></span><button id="bag-next" aria-label="下一页鱼获">下页 →</button>';
  bag.append(pager);
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
      (fish) => new Option(`${fishStars(fish.stars)} ${fish.name}`, fish.id),
    ),
  );
  speciesChoice.append(species);
  get('atlas-list').before(speciesChoice);
  const atlasPager = document.createElement('div');
  atlasPager.className = 'collection-pager';
  atlasPager.innerHTML =
    '<button id="atlas-prev" aria-label="上一种鱼">← 上一种</button><span id="atlas-page" aria-live="polite"></span><button id="atlas-next" aria-label="下一种鱼">下一种 →</button>';
  atlas.append(atlasPager);
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
    get('bag-page').textContent = `${page + 1} / ${pages} 页`;
    (get('bag-prev') as HTMLButtonElement).disabled = page === 0;
    (get('bag-next') as HTMLButtonElement).disabled = page + 1 === pages;
    bag.hidden = supplyMode;
    supplies.hidden = !supplyMode;
    get('bag-tab-fish').setAttribute('aria-pressed', String(!supplyMode));
    get('bag-tab-supplies').setAttribute('aria-pressed', String(supplyMode));
    const index = Math.max(
      0,
      FISH.findIndex((fish) => fish.id === species.value),
    );
    get('atlas-list')
      .querySelectorAll<HTMLElement>('.fish-entry')
      .forEach((card) => {
        card.hidden = card.dataset.species !== species.value;
      });
    get('atlas-page').textContent = `${index + 1} / ${FISH.length} 种`;
    (get('atlas-prev') as HTMLButtonElement).disabled = index === 0;
    (get('atlas-next') as HTMLButtonElement).disabled =
      index === FISH.length - 1;
  };
  get('bag-tab-fish').addEventListener('click', () => {
    supplyMode = false;
    refresh();
  });
  get('bag-tab-supplies').addEventListener('click', () => {
    supplyMode = true;
    refresh();
  });
  get('bag-prev').addEventListener('click', () => {
    page = Math.max(0, page - 1);
    refresh();
  });
  get('bag-next').addEventListener('click', () => {
    page++;
    refresh();
  });
  species.addEventListener('change', refresh);
  for (const [id, delta] of [
    ['atlas-prev', -1],
    ['atlas-next', 1],
  ] as const)
    get(id).addEventListener('click', () => {
      const index = FISH.findIndex((fish) => fish.id === species.value);
      species.value =
        FISH[Math.max(0, Math.min(FISH.length - 1, index + delta))]!.id;
      refresh();
    });
  refresh();
  return { refresh };
}
