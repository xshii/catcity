import type { GameSession } from '../../application';
import {
  discoveredSpecies,
  skillLevel,
  SPOT_IDS,
  SPOTS,
  spotOpen,
  type SpotId,
} from '../../content/fishing';

/** The outing page lists every waterway and its unlock state; picking one finds it on the map. */
export function mountOuting(
  session: GameSession,
  panel: HTMLElement,
  focusWaterway: (spotId: SpotId) => void,
) {
  panel.innerHTML =
    '<p class="outing-intro">选一片水域，在地图上找到它，再让猫沿路走到岸边。</p><ul id="outing-list" class="outing-list"></ul>';
  const list = panel.querySelector<HTMLElement>('#outing-list')!;
  let key = '';
  const render = () => {
    const { fishing } = session.getSnapshot();
    const level = skillLevel(fishing.xp);
    const discovered = discoveredSpecies(fishing.atlas);
    const next = JSON.stringify([level, discovered]);
    if (next === key) return;
    key = next;
    list.replaceChildren(
      ...SPOT_IDS.map((id) => {
        const spot = SPOTS[id];
        const item = document.createElement('li');
        const name = document.createElement('strong');
        name.textContent = spot.name;
        const status = document.createElement('small');
        status.textContent = spotOpen(id, fishing)
          ? `已开放 · ${spot.hint}`
          : `未解锁 · 需钓技 ${spot.level} 级（现在 ${level} 级）与 ${spot.species} 种图鉴（已有 ${discovered} 种）`;
        const find = document.createElement('button');
        find.className = 'quiet';
        find.dataset.outingSpot = id;
        find.textContent = '在地图上找到';
        find.setAttribute('aria-label', `在地图上找到${spot.name}`);
        find.addEventListener('click', () => focusWaterway(id));
        item.append(name, status, find);
        return item;
      }),
    );
  };
  session.subscribe(render);
  render();
}
