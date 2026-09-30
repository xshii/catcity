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
import { MAX_STAT, type CatEntity, type WorldState } from '../../core';
import { toViewModel } from '../shell/model';
import { moodBadge } from '../shell/mood';
import { bondBadge } from '../shell/bond';
import { catPortrait, fishIllustration } from '../art/illustrations';
import { catPose } from '../art/cat-look';
import { riverBackdrop } from '../art/river-palette';

/** The river caption before a run. */
const READY_TIP = '点击水面选择落点，再准备抛竿';

function createEnergyCard(cat: CatEntity, select: (id: string) => void) {
  const button = document.createElement('button');
  button.className = 'energy-cat';
  button.dataset.catId = cat.id;
  let portrait = '';
  const text = document.createElement('span');
  const name = document.createElement('strong');
  const energy = document.createElement('small');
  const progress = document.createElement('progress');
  progress.max = MAX_STAT;
  const activity = document.createElement('small');
  const mood = document.createElement('small');
  mood.className = 'mood-line';
  mood.setAttribute('role', 'img');
  const hint = document.createElement('small');
  hint.className = 'mood-hint';
  // The curled portrait shows it; screen readers hear the words.
  const rest = document.createElement('small');
  rest.className = 'rest-label';
  rest.textContent = '在休息';
  const bond = document.createElement('small');
  bond.className = 'bond-line';
  bond.setAttribute('role', 'img');
  text.append(name, energy, progress, activity, rest, mood, hint, bond);
  button.append(text);
  button.addEventListener('click', () => select(cat.id));
  return {
    button,
    update(
      cat: CatEntity,
      world: WorldState,
      selected: string,
      river: boolean,
    ) {
      // At the river the selected cat is the one fishing with the player: awake (R-01).
      const pose = catPose(world, cat, {
        atRiver: river && cat.id === selected,
      });
      const next = catPortrait(cat.appearance.coat, pose);
      if (portrait !== next) {
        portrait = next;
        button.querySelector('svg')?.remove();
        button.insertAdjacentHTML('afterbegin', portrait);
      }
      button.setAttribute('aria-pressed', String(cat.id === selected));
      button.disabled = !!world.fishing.active;
      name.textContent = cat.name;
      energy.textContent = `${CAT_BREEDS[cat.breedId].name} · ${cat.needs.energy}/${MAX_STAT}`;
      progress.value = cat.needs.energy;
      progress.setAttribute('aria-label', `${cat.name} 体力`);
      activity.textContent = cat.walk
        ? `步行中 · 剩 ${cat.walk.route.length} 格`
        : cat.fishingSpotId
          ? `在${SPOTS[cat.fishingSpotId].name}岸边`
          : '在小城里';
      rest.hidden = !pose.curled;
      const badge = moodBadge(cat.mood);
      mood.textContent = badge.text;
      mood.setAttribute('aria-label', badge.label);
      hint.textContent = badge.hint;
      hint.hidden = !badge.hint;
      const level = bondBadge(cat.playerBond);
      bond.textContent = `${level.hearts} ${level.name}`;
      bond.setAttribute('aria-label', level.label);
    },
  };
}

/** Page elements the fishing scene is handed by the shell: the map frame and the scene switch. */
export interface FishingShell {
  game: HTMLElement;
  visitCity: HTMLElement;
  visitRiver: HTMLElement;
  /** The notice bar: the fishing screen keeps it off the catch card. */
  notice: HTMLElement;
}

/** Scene HUD renders snapshots; every action is forwarded to the session or an input control. */
export function mountFishingStage(
  session: GameSession,
  place: PlaceState,
  shell: FishingShell,
  access: { canEnter: () => boolean; onNeedTravel: () => void },
) {
  const { game } = shell;
  const stage = document.createElement('div');
  stage.id = 'fishing-stage';
  game.before(stage);
  stage.append(game);
  const hud = document.createElement('div');
  hud.id = 'river-hud';
  hud.hidden = true;
  hud.innerHTML = `<div class="river-caption"><span class="eyebrow">A LITTLE RIVERSIDE</span><h2 id="river-place"></h2><p id="river-tip">${READY_TIP}</p></div><span id="river-clock" class="river-clock"></span><div id="catch-reveal" class="catch-reveal" hidden></div>`;
  stage.append(hud);
  const $ = (id: string) => hud.querySelector<HTMLElement>(`#${id}`)!;
  const roster = document.createElement('section');
  roster.id = 'river-roster';
  roster.setAttribute('aria-label', '猫咪体力');
  roster.innerHTML =
    '<div id="cat-energy-cards" class="cat-energy-cards"></div>';
  stage.before(roster);
  const cards = new Map<string, ReturnType<typeof createEnergyCard>>();
  const cardContainer = roster.querySelector<HTMLElement>('#cat-energy-cards')!;
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
  shell.visitRiver.addEventListener('click', showRiver);
  shell.visitCity.addEventListener('click', () => show(false));
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
    /**
     * `resultNote`: what the last result changed for the cat (mood band, bond level), if
     * anything;
     * `showResult`: whether the last result is this visit's catch (`resultShown`).
     */
    render(
      world: WorldState,
      selected: string,
      spot: SpotId,
      resultNote: string,
      showResult: boolean,
    ) {
      const run = world.fishing.active;
      const clock = toViewModel(world, selected);
      $('river-clock').textContent = `第 ${clock.day} 天 · ${clock.time}`;
      $('river-place').textContent = SPOTS[run?.spotId ?? spot].name;
      // The page continues the art of the water shown around it, in the hour's light.
      stage.style.background =
        place.get() === 'river'
          ? riverBackdrop(run?.spotId ?? spot, world.minute)
          : '';
      $('river-tip').textContent = run
        ? {
            charge: '按住鱼竿蓄力，松开抛投',
            waiting: '看鱼漂，等鱼儿咬钩…',
            hook: '咬钩了！绿区内提竿',
            fight: '按住收线 · 松开放线',
            caught: '钓到了！',
            escaped: '鱼儿溜走了',
          }[run.phase]
        : READY_TIP;
      stage.dataset.phase = run?.phase ?? 'ready';
      // Keep button identity across clock ticks so keyboard focus and touch targets survive.
      let next = cardContainer.firstElementChild;
      for (const cat of world.cats) {
        let card = cards.get(cat.id);
        if (!card) {
          card = createEnergyCard(cat, (id) => session.select(id));
          cards.set(cat.id, card);
        }
        card.update(cat, world, selected, place.get() === 'river');
        if (card.button !== next) cardContainer.insertBefore(card.button, next);
        next = card.button.nextElementSibling;
      }
      for (const [id, card] of cards) {
        if (world.cats.some((cat) => cat.id === id)) continue;
        card.button.remove();
        cards.delete(id);
      }
      const reveal = $('catch-reveal');
      const result = world.fishing.lastResult;
      reveal.hidden = !showResult;
      if (result && resultKey !== JSON.stringify([result, resultNote])) {
        resultKey = JSON.stringify([result, resultNote]);
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
        if (resultNote) {
          const note = document.createElement('small');
          note.className = 'catch-mood';
          note.textContent = resultNote;
          reveal.append(note);
        }
      }
    },
  };
}
