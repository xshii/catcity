import { CITY_TIME } from '../../content/city';
import type { GameSession } from '../../application';
import { CAT_BREEDS } from '../../content/breeds';
import {
  FISHING,
  fishById,
  fishStars,
  SPOTS,
  type SpotId,
} from '../../content/fishing';
import type { CatEntity, WorldState } from '../../core';
import { toViewModel } from '../shell/model';

export function fishIllustration(color: string): string {
  return `<svg viewBox="0 0 180 90" aria-hidden="true"><ellipse cx="92" cy="76" rx="54" ry="5" fill="#456a5c" opacity=".12"/><path d="M52 43L16 18Q24 43 16 68L52 48" fill="${color}"/><path d="M77 28L100 9L119 32M89 58L110 78L122 53" fill="${color}"/><ellipse cx="99" cy="44" rx="53" ry="27" fill="${color}"/><path d="M60 47Q96 76 141 48" fill="#fff" opacity=".3"/><path d="M112 25Q96 44 112 65" stroke="#43584e" opacity=".3" fill="none" stroke-width="3"/><circle cx="131" cy="36" r="4" fill="#334b46"/><circle cx="132" cy="35" r="1.3" fill="#fff"/></svg>`;
}
function portrait(coat: 'cream' | 'gray'): string {
  const color = coat === 'cream' ? '#efdbb2' : '#bbc3c7';
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 31L10 9l17 12h10L54 9l-2 22" fill="${color}"/><ellipse cx="32" cy="35" rx="23" ry="20" fill="${color}"/><path d="M15 26l-2-12 10 9M41 23l10-9-2 12" fill="#d7aba0"/><circle cx="23" cy="34" r="2" fill="#506054"/><circle cx="41" cy="34" r="2" fill="#506054"/><path d="M29 40h6l-3 4z" fill="#af857a"/><path d="M28 47l4-3 4 3" stroke="#8c8070" fill="none"/></svg>`;
}

function createEnergyCard(cat: CatEntity, select: (id: string) => void) {
  const button = document.createElement('button');
  button.className = 'energy-cat';
  button.dataset.catId = cat.id;
  let coat = cat.appearance.coat;
  button.innerHTML = portrait(coat);
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
    update(cat: CatEntity, minute: number, selected: string, fishing: boolean) {
      if (coat !== cat.appearance.coat) {
        coat = cat.appearance.coat;
        button.querySelector('svg')!.remove();
        button.insertAdjacentHTML('afterbegin', portrait(coat));
      }
      button.setAttribute('aria-pressed', String(cat.id === selected));
      button.disabled = fishing;
      name.textContent = cat.name;
      energy.textContent = `${CAT_BREEDS[cat.breedId].name} · ${cat.needs.energy}/100`;
      progress.value = cat.needs.energy;
      progress.setAttribute('aria-label', `${cat.name} 体力`);
      activity.textContent = cat.rest
        ? `休息中 ${cat.rest.until - minute} 分钟`
        : cat.walk
          ? `步行中 · 剩 ${cat.walk.route.length} 格`
          : `位置 ${cat.position.x + 1},${cat.position.y + 1}`;
      sleep.hidden = !cat.rest;
    },
  };
}

/** Scene HUD renders snapshots; every action is forwarded to the session or an input control. */
export function mountFishingStage(
  session: GameSession,
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
  roster.hidden = true;
  roster.setAttribute('aria-label', '猫咪体力与休息');
  roster.innerHTML =
    '<div id="cat-energy-cards" class="cat-energy-cards"></div><div class="clock-actions"><span>所有猫共享城市时间</span><button id="time-forward">全城快进 1 小时 ⏱</button></div>';
  stage.before(roster);
  document.getElementById('time-forward')!.addEventListener('click', () =>
    session.execute({
      type: 'ADVANCE_TIME',
      minutes: CITY_TIME.fastForwardMinutes,
    }),
  );
  const cards = new Map<string, ReturnType<typeof createEnergyCard>>();
  const cardContainer = document.getElementById('cat-energy-cards')!;
  let resultKey = '';
  let previousRun: string | undefined;
  const show = (next: boolean) => {
    hud.hidden = !next;
    roster.hidden = !next;
    stage.classList.toggle('is-river', next);
  };
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
    render(world: WorldState, selected: string, spot: SpotId) {
      const runId = world.fishing.active?.id;
      if (runId && runId !== previousRun) showRiver();
      previousRun = runId;
      if (stage.classList.contains('is-river') && !access.canEnter()) {
        show(false);
        access.onNeedTravel();
      }
      const run = world.fishing.active;
      const clock = toViewModel(world, selected);
      document.getElementById('river-clock')!.textContent =
        `第 ${clock.day} 天 · ${clock.time}`;
      document.getElementById('river-place')!.textContent =
        SPOTS[run?.spotId ?? spot].name;
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
        card.update(cat, world.minute, selected, !!run);
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
          reveal.innerHTML = `<small>这次的收获</small>${fishIllustration(fish.color)}<strong>${fishStars(fish.stars)} ${fish.name}</strong><span>${(result.lengthMm / 10).toFixed(1)} cm · ${result.weight} g</span><span class="catch-price">${fish.price} 金币 · 已放入鱼篓</span>`;
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
