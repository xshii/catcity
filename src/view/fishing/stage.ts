import type { PlaceState } from '../common/place';
import {
  FISHING,
  fishById,
  fishStars,
  SPOTS,
  type SpotId,
} from '../../content/fishing';
import type { WorldState } from '../../core';
import { toViewModel } from '../common/model';
import { fishIllustration } from '../art/illustrations';
import { riverBackdrop } from '../art/river-palette';
import {
  CATCH_CARD_MS,
  goldCatch,
  SCREEN_COPY,
  type catchCountdown,
} from './screen';
import type { SettingsSheet } from '../common/settings';

/** The river caption before a run. */
const READY_TIP = '点击水面选择落点，再准备抛竿';

/** The tool sheet the shell lays out around the river's panels (shell/layout.ts). */
interface FishingLayout {
  refresh: () => void;
  close: () => void;
  isOpen: () => boolean;
  /** Opens the cats panel on its conversation page. */
  openTalk: () => void;
  /** The travel line it puts in the gear panel. */
  travelDuration: HTMLElement;
  travelButton: HTMLButtonElement;
}

/** Page elements the fishing scene is handed by the shell: the map frame and the scene switch. */
export interface FishingShell {
  game: HTMLElement;
  visitCity: HTMLElement;
  visitRiver: HTMLElement;
  /** The notice bar: the fishing screen keeps it off the catch card. */
  notice: HTMLElement;
  /** The settings sheet of every page: its sound and haptics, and the river's section. */
  settings: SettingsSheet;
  /**
   * Lays out the tool sheet once the river's panels exist; `toggled` runs when a panel
   * opens or closes.
   */
  layout: (toggled: () => void) => FishingLayout;
}

/** Scene HUD renders snapshots; every action is forwarded to the session or an input control. */
export function mountFishingStage(
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
  const reveal = $('catch-reveal');
  // The card's time runs out along its bottom edge (R-02): CSS animates it, as long as
  // the card's own countdown.
  reveal.style.setProperty('--catch-card-ms', `${CATCH_CARD_MS}ms`);
  const countdownBar = document.createElement('span');
  countdownBar.className = 'catch-countdown';
  countdownBar.setAttribute('aria-hidden', 'true');
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
    /** The catch card: a tap on it closes it. */
    card: reveal,
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
     * `countdown`: whether the last result is this visit's catch, and if so whether its
     * card counts down or is held (`catchCountdown`).
     */
    render(
      world: WorldState,
      selected: string,
      spot: SpotId,
      resultNote: string,
      countdown: ReturnType<typeof catchCountdown>,
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
      const result = world.fishing.lastResult;
      reveal.hidden = !countdown;
      if (reveal.dataset.countdown !== (countdown ?? '')) {
        reveal.dataset.countdown = countdown ?? '';
        // The bar stops or goes on now, with the timer: a hidden page draws no frame that
        // would apply it before the page shows again.
        void getComputedStyle(countdownBar).animationPlayState;
      }
      if (result && resultKey !== JSON.stringify([result, resultNote])) {
        resultKey = JSON.stringify([result, resultNote]);
        const gold = goldCatch(result);
        // The card of a gold catch glints once and its star pops, in CSS (ui-design 5.9).
        reveal.dataset.gold = String(gold);
        if (result.caught && result.speciesId) {
          const fish = fishById(result.speciesId);
          const { glyph, goldCatch: goldLabel } = SCREEN_COPY.atlas;
          reveal.innerHTML = `${gold ? `<i class="catch-gold" role="img" aria-label="${goldLabel}">${glyph.lit}</i>` : ''}<small>这次的收获</small>${fishIllustration(fish.id)}<strong>${fishStars(fish.stars)} ${fish.name}</strong><span>${(result.lengthMm / 10).toFixed(1)} cm · ${result.weight} g</span><span class="catch-price">${fish.price} 金币 · 已放入鱼篓</span>`;
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
        reveal.append(countdownBar);
      }
    },
  };
}
