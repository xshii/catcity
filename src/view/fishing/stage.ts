import type { PlaceState } from '../shell/place';
import type { GameSession } from '../../application';
import { CAT_BREEDS } from '../../content/breeds';
import {
  FISHING,
  fishById,
  fishStars,
  SPOTS,
  type SpotId,
} from '../../content/fishing';
import { catIdle, type CatEntity, type WorldState } from '../../core';
import { toViewModel } from '../shell/model';
import { catPortrait, fishIllustration } from '../art/illustrations';

function createEnergyCard(cat: CatEntity, select: (id: string) => void) {
  const button = document.createElement('button');
  button.className = 'energy-cat';
  button.dataset.catId = cat.id;
  let coat = cat.appearance.coat;
  button.innerHTML = catPortrait(coat);
  const text = document.createElement('span');
  const name = document.createElement('strong');
  const energy = document.createElement('small');
  const progress = document.createElement('progress');
  progress.max = 100;
  const activity = document.createElement('small');
  const sleep = document.createElement('b');
  sleep.className = 'sleep-mark';
  sleep.textContent = 'zZ';
  text.append(name, energy, progress, activity);
  button.append(text, sleep);
  button.addEventListener('click', () => select(cat.id));
  return {
    button,
    update(
      cat: CatEntity,
      world: WorldState,
      selected: string,
      fishing: boolean,
    ) {
      if (coat !== cat.appearance.coat) {
        coat = cat.appearance.coat;
        button.querySelector('svg')!.remove();
        button.insertAdjacentHTML('afterbegin', catPortrait(coat));
      }
      button.setAttribute('aria-pressed', String(cat.id === selected));
      button.disabled = fishing;
      name.textContent = cat.name;
      energy.textContent = `${CAT_BREEDS[cat.breedId].name} · ${cat.needs.energy}/100`;
      progress.value = cat.needs.energy;
      progress.setAttribute('aria-label', `${cat.name} 体力`);
      const recovering = catIdle(world, cat) && cat.needs.energy < 100;
      activity.textContent = cat.walk
        ? `步行中 · 剩 ${cat.walk.route.length} 格`
        : cat.fishingSpotId
          ? `在${SPOTS[cat.fishingSpotId].name}岸边`
          : '在小城里';
      sleep.hidden = !recovering;
    },
  };
}

/** Scene HUD renders snapshots; every action is forwarded to the session or an input control. */
export function mountFishingStage(
  session: GameSession,
  place: PlaceState,
  access: { canEnter: () => boolean; onNeedTravel: () => void },
) {
  const game = document.getElementById('game')!;
  const stage = document.createElement('div');
  stage.id = 'fishing-stage';
  game.before(stage);
  stage.append(game);
  const hud = document.createElement('div');
  hud.id = 'river-hud';
  hud.hidden = true;
  hud.innerHTML = `<div class="river-caption"><span class="eyebrow">A LITTLE RIVERSIDE</span><h2 id="river-place"></h2><p id="river-tip">点击水面选择落点，再准备抛竿</p></div><span id="river-clock" class="river-clock"></span><div id="catch-reveal" class="catch-reveal" hidden></div>`;
  stage.append(hud);
  const roster = document.createElement('section');
  roster.id = 'river-roster';
  roster.setAttribute('aria-label', '猫咪体力');
  roster.innerHTML =
    '<div id="cat-energy-cards" class="cat-energy-cards"></div>';
  stage.before(roster);
  const cards = new Map<string, ReturnType<typeof createEnergyCard>>();
  const cardContainer = document.getElementById('cat-energy-cards')!;
  let resultKey = '';
  let previousRun: string | undefined;
  // The class only styles the river; modules read and follow `place` directly.
  place.subscribe((next) => {
    const river = next === 'river';
    hud.hidden = !river;
    stage.classList.toggle('is-river', river);
  });
  const show = (river: boolean) => place.set(river ? 'river' : 'city');
  const showRiver = () => {
    if (!access.canEnter()) {
      show(false);
      access.onNeedTravel();
      return false;
    }
    show(true);
    return true;
  };
  document.getElementById('visit-river')!.addEventListener('click', showRiver);
  document
    .getElementById('visit-city')!
    .addEventListener('click', () => show(false));
  return {
    stage,
    showRiver,
    /**
     * World changes that move the scene: a new run shows the river; a cat that left the
     * shore takes it back to the city. Called on world changes, never while rendering.
     */
    follow(world: WorldState) {
      const runId = world.fishing.active?.id;
      if (runId && runId !== previousRun) showRiver();
      previousRun = runId;
      if (place.get() === 'river' && !access.canEnter()) {
        show(false);
        access.onNeedTravel();
      }
    },
    render(world: WorldState, selected: string, spot: SpotId) {
      const run = world.fishing.active;
      const clock = toViewModel(world, selected);
      document.getElementById('river-clock')!.textContent =
        `第 ${clock.day} 天 · ${clock.time}`;
      document.getElementById('river-place')!.textContent =
        SPOTS[run?.spotId ?? spot].name;
      // The page continues the far bank of the water shown (layout.css).
      stage.dataset.spot = run?.spotId ?? spot;
      document.getElementById('river-tip')!.textContent = run
        ? {
            charge: '按住鱼竿蓄力，松开抛投',
            waiting: '看鱼漂，等鱼儿咬钩…',
            hook: '咬钩了！绿区内提竿',
            fight: '按住收线 · 松开放线',
            caught: '钓到了！',
            escaped: '鱼儿溜走了',
          }[run.phase]
        : '点击水面选择落点，再准备抛竿';
      stage.dataset.phase = run?.phase ?? 'ready';
      // Keep button identity across clock ticks so keyboard focus and touch targets survive.
      let next = cardContainer.firstElementChild;
      for (const cat of world.cats) {
        let card = cards.get(cat.id);
        if (!card) {
          card = createEnergyCard(cat, (id) => session.select(id));
          cards.set(cat.id, card);
        }
        card.update(cat, world, selected, !!run);
        if (card.button !== next) cardContainer.insertBefore(card.button, next);
        next = card.button.nextElementSibling;
      }
      for (const [id, card] of cards) {
        if (world.cats.some((cat) => cat.id === id)) continue;
        card.button.remove();
        cards.delete(id);
      }
      const reveal = document.getElementById('catch-reveal')!;
      const result = world.fishing.lastResult;
      reveal.hidden = !!run || !result;
      if (result && resultKey !== JSON.stringify(result)) {
        resultKey = JSON.stringify(result);
        if (result.caught && result.speciesId) {
          const fish = fishById(result.speciesId);
          reveal.innerHTML = `<small>这次的收获</small>${fishIllustration(fish.id)}<strong>${fishStars(fish.stars)} ${fish.name}</strong><span>${(result.lengthMm / 10).toFixed(1)} cm · ${result.weight} g</span><span class="catch-price">${fish.price} 金币 · 已放入鱼篓</span>`;
        } else {
          const title = result.trashAmount
            ? '鱼溜走了，钓到一件垃圾'
            : !result.caught
              ? '这一竿，鱼儿先回家了'
              : result.catchKind === 'can'
                ? '钓到密封猫罐头'
                : `钓到金币袋 · +${result.lootAmount}`;
          reveal.innerHTML = `<span class="loot-art" aria-hidden="true">${result.trashAmount ? '🥾' : !result.caught ? '≈' : result.catchKind === 'can' ? '🥫' : '💰'}</span><strong>${title}</strong><small>${result.trashAmount ? `已收进鱼篓补给 · 可回收 +${FISHING.supplies.trashCoins} 金币` : '调整落点，再试一竿吧'}</small>`;
        }
      }
    },
  };
}
