import type { Aim, AimControl, PlaceState, Tools } from '../shell/place';
import { CAT_BREEDS } from '../../content/breeds';
import type { GameSession } from '../../application';
import {
  discoveredSpecies,
  FISHING,
  BAITS,
  BAIT_IDS,
  fishById,
  fishStars,
  SPOTS,
  SPOT_IDS,
  skillLevel,
  spotUnlocked,
  type BaitId,
  type SpotId,
} from '../../content/fishing';
import { greenZone } from '../../minigames/angling';
import { CARE } from '../../content/care';
import { mountFishingFeedback } from './feedback';
import { mountFishingStage } from './stage';
import { renderFishingCatalog } from './catalog';
import { mountFishingLayout } from '../shell/layout';
import { restMinutesLeft } from '../shell/model';
import { mountFishingCollections } from './collections';
import { mountMotionFishing } from '../motion/motion-fishing';
import { onShore } from '../../core/city';
import { mountFishingControls } from './controls';
import {
  ANGLING_MARKUP,
  BUTTON_PHASE_INSTRUCTIONS,
  BUTTON_PHASE_NAMES,
} from './template';
import { ERROR_MESSAGES } from '../shell/errors';

const CAST_COST = FISHING.cast.staminaCost;
const REST = CARE.rest;

export function mountAngling(
  session: GameSession,
  place: PlaceState,
  notify: (text: string) => void,
  onNeedTravel: (spotId: SpotId) => void,
) {
  const atShore = (spotId: SpotId, catId: string) => {
    const world = session.getSnapshot();
    const cat = world.cats.find((item) => item.id === catId);
    return !!cat && !cat.walk && onShore(world.map, spotId, cat.position);
  };
  const requestedSpot = () =>
    ((document.getElementById('fish-location') as HTMLSelectElement | null)
      ?.value as SpotId) || 'POND';
  const stage = mountFishingStage(session, place, {
    canEnter: () => {
      const world = session.getSnapshot();
      return atShore(
        world.fishing.active?.spotId ?? requestedSpot(),
        world.fishing.active?.catId ??
          session.selectedEntity ??
          world.cats[0]!.id,
      );
    },
    onNeedTravel: () => onNeedTravel(requestedSpot()),
  });
  const root = document.createElement('section');
  root.id = 'angling';
  root.className = 'angling';
  root.hidden = true;
  stage.stage.after(root);
  root.innerHTML = ANGLING_MARKUP;
  const get = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  stage.stage.append(get('angling-live'));
  const ready = document.createElement('div');
  ready.id = 'scene-ready';
  ready.className = 'scene-ready';
  ready.append(get('cast-start'));
  stage.stage.append(ready);
  const restActions = document.createElement('div');
  restActions.className = 'cat-rest-actions';
  restActions.append(get('fish-rest'));
  get('river-roster').append(restActions);
  const feedback = mountFishingFeedback(session, stage.stage);
  const location = get<HTMLSelectElement>('fish-location');
  const companion = get<HTMLSelectElement>('fish-companion');
  const bait = get<HTMLSelectElement>('fish-bait');
  const direction = get<HTMLInputElement>('fish-direction');
  const depth = get<HTMLInputElement>('fish-depth');
  const control = get<HTMLButtonElement>('fish-control');
  let detailsKey = '';
  let aimKey = '';
  let aimPower = FISHING.input.maxPower / 2;
  const aimListeners = new Set<() => void>();
  let previousRun: string | undefined;
  const report = (
    result: ReturnType<GameSession['execute']>,
    success: string,
  ) => notify(result.ok ? success : ERROR_MESSAGES[result.error]);
  const render = () => {
    const world = session.getSnapshot();
    const f = world.fishing;
    const run = f.active;
    if (run?.id !== previousRun) {
      controls.pause();
      previousRun = run?.id;
      if (run) root.hidden = false;
    }
    const active = !!run;
    const selectedCat =
      world.cats.find(
        (cat) => cat.id === (run?.catId ?? session.selectedEntity),
      ) ?? world.cats[0]!;
    const energy = selectedCat.needs.energy;
    // Motion play needs no prepare button or button-mode meters, so the river grows.
    const motionPlay = motion?.active() || run?.mode === 'motion';
    document
      .querySelector('.shell')
      ?.classList.toggle('motion-play', !!motionPlay);
    // Until a phone chooses motion or buttons, only the motion card is offered.
    get('scene-ready').hidden =
      active || !!motion?.active() || !!motion?.offersEnable();
    get<HTMLButtonElement>('cast-start').disabled =
      active || !!selectedCat.rest || energy < CAST_COST;
    get<HTMLButtonElement>('fish-rest').disabled =
      !!selectedCat.rest || energy === 100 || run?.catId === selectedCat.id;
    get('fish-rest').textContent = selectedCat.rest
      ? `${selectedCat.name} 休息中 · 剩 ${restMinutesLeft(selectedCat.rest, world.minute)} 分钟`
      : run?.catId === selectedCat.id
        ? '钓鱼中 · 收竿后再休息'
        : energy === 100
          ? `${selectedCat.name} 体力已满，不需要休息`
          : `休息 ${REST.minutes / 60} 小时 · +${(REST.minutes / REST.tickMinutes) * REST.recovery} 体力`;
    for (const field of [location, companion, bait, direction, depth])
      field.disabled = active;

    get('angling-live').hidden = !run;
    get('angling-live').dataset.mode = run?.mode ?? '';
    const key = JSON.stringify([
      f.xp,
      f.supplies,
      energy,
      f.baits,
      f.inventory,
      f.atlas,
      f.lastResult,
      world.cats.map((cat) => [
        cat.id,
        cat.fishGift,
        cat.rest,
        cat.needs.energy,
        cat.fishingSpotId,
        cat.walk,
        cat.position,
      ]),
      session.selectedEntity,
      location.value,
      companion.value,
      bait.value,
    ]);
    if (detailsKey !== key) {
      detailsKey = key;
      const discovered = discoveredSpecies(f.atlas);
      const level = skillLevel(f.xp);
      get('fishing-level').textContent = `钓技 Lv.${level}`;
      get('fishing-resources').textContent =
        `经验 ${f.xp}${level < 10 ? ` / ${level * 40} 升级` : ' · 已满级'} · 等级提高，绿色区间更宽`;
      const spot =
        location.value || run?.spotId || selectedCat.fishingSpotId || 'POND';
      location.replaceChildren(
        ...SPOT_IDS.map((id) => {
          const option = new Option(
            `${SPOTS[id].name}${spotUnlocked(id, f.xp, discovered) ? '' : ' · 未解锁'}`,
            id,
          );
          option.disabled = !spotUnlocked(id, f.xp, discovered);
          return option;
        }),
      );
      location.value = spot;
      const catId =
        run?.catId ??
        (world.cats.some((cat) => cat.id === session.selectedEntity)
          ? session.selectedEntity!
          : world.cats[0]!.id);
      companion.replaceChildren(
        ...world.cats.map(
          (cat) =>
            new Option(`${cat.name} · ${CAT_BREEDS[cat.breedId].name}`, cat.id),
        ),
      );
      companion.value = catId;
      const baitId = bait.value || run?.baitId || 'BREAD';
      bait.replaceChildren(
        ...BAIT_IDS.map(
          (id) =>
            new Option(
              `${BAITS[id].name} · ${id === 'BREAD' ? '无限' : f.baits[id]} · ${BAITS[id].hint}`,
              id,
            ),
        ),
      );
      bait.value = baitId;
      get('spot-hint').textContent =
        `${SPOTS[location.value as SpotId].hint}。力度控制远近，方向决定落点。`;
      get('spot-unlocks').textContent = SPOT_IDS.slice(1)
        .map(
          (id) =>
            `${SPOTS[id].name}：${spotUnlocked(id, f.xp, discovered) ? '已开放 ✓' : `钓技 ${level}/${SPOTS[id].level} 级 · 图鉴 ${discovered}/${SPOTS[id].species} 种`}`,
        )
        .join(' → ');
      get('invite-pepper').hidden = world.cats.some(
        (cat) => cat.definitionId === 'PEPPER',
      );
      const cat = world.cats.find((cat) => cat.id === companion.value)!;
      get('companion-specialty').textContent =
        `${cat.name} · ${CAT_BREEDS[cat.breedId].name}：${CAT_BREEDS[cat.breedId].fishingHint}。鱼饵、落点和钓点条件仍需满足。`;
      renderFishingCatalog(world, cat, (command, message) =>
        report(session.execute(command), message),
      );
    }
    if (run) {
      get('angling-phase').textContent = BUTTON_PHASE_NAMES[run.phase];
      get('angling-status').textContent = controls.paused()
        ? '已暂停 · 按操作键继续'
        : run.speciesId && run.phase === 'fight'
          ? `${fishStars(fishById(run.speciesId).stars)} ${fishById(run.speciesId).behavior}`
          : `${run.power}% 力度`;
      get('angling-instruction').textContent =
        BUTTON_PHASE_INSTRUCTIONS[run.phase];
      const zone = greenZone(run);
      const value =
        run.phase === 'fight'
          ? run.tension
          : run.phase === 'hook'
            ? run.cursor
            : run.power;
      get('angling-green').style.left = `${zone.low}%`;
      get('angling-green').style.width = `${zone.high - zone.low}%`;
      get('angling-cursor').style.left = `${value}%`;
      get('angling-bar').setAttribute('aria-valuenow', String(value));
      get('angling-bar').dataset.phase = run.phase;
      get('angling-bar').dataset.low = String(zone.low);
      get('angling-bar').dataset.high = String(zone.high);
      get<HTMLProgressElement>('fish-progress').value = run.progress;
      get<HTMLProgressElement>('line-health').value = run.lineHealth;
      control.setAttribute('aria-pressed', String(controls.pressed()));
      get('fish-pause').textContent = controls.paused() ? '继续钓鱼' : '暂停';
    }
    stage.render(world, selectedCat.id, (location.value || 'POND') as SpotId);
    layout?.refresh();
    motion?.refresh();
    collections.refresh();
    const destination = (location.value || 'POND') as SpotId;
    const atDestination = atShore(destination, selectedCat.id);
    get('travel-duration').textContent = atDestination
      ? `已在${SPOTS[destination].name}`
      : selectedCat.walk
        ? `步行中 · 剩 ${selectedCat.walk.route.length} 格 · 每格消耗 ${CARE.walkEnergyPerTile} 体力`
        : `需要先走到岸边 · 耗时取决于道路 · 每格消耗 ${CARE.walkEnergyPerTile} 体力`;
    get<HTMLButtonElement>('travel-to-spot').disabled =
      active || !!selectedCat.rest || atDestination;
    get('travel-to-spot').textContent = atDestination
      ? '已经抵达'
      : '出发去钓点 →';
    get<HTMLButtonElement>('cast-start').disabled ||= !atDestination;
    get('cast-start').textContent = atDestination
      ? `准备抛竿 ↗ · ${CAST_COST} 体力`
      : '先在地图走到岸边';
    root
      .querySelectorAll<HTMLButtonElement>('[data-bait]')
      .forEach((button) => {
        button.disabled = active;
        button.setAttribute(
          'aria-pressed',
          String(button.dataset.bait === bait.value),
        );
      });
    get('depth-value').textContent = `近 ← ${depth.value}% → 远`;
    get('direction-value').textContent =
      `${Number(direction.value) < 0 ? '左' : '右'} ${Math.abs(Number(direction.value))}°`;
    const nextAim = JSON.stringify(currentAim());
    if (nextAim !== aimKey) {
      aimKey = nextAim;
      for (const listener of aimListeners) listener();
    }
  };
  const currentAim = (): Aim => ({
    spotId: (location.value || 'POND') as SpotId,
    direction: Number(direction.value),
    depth: Number(depth.value),
    // Only motion aiming sets the power before a run; the button flow charges it.
    power: motion.active() ? aimPower : FISHING.input.maxPower / 2,
  });
  const aim: AimControl = {
    get: currentAim,
    set(next) {
      if (next.direction !== undefined)
        direction.value = String(next.direction);
      if (next.depth !== undefined) depth.value = String(next.depth);
      if (next.power !== undefined) aimPower = next.power;
      render();
    },
    subscribe(listener) {
      aimListeners.add(listener);
      return () => aimListeners.delete(listener);
    },
  };
  const controls = mountFishingControls({
    session,
    place,
    control,
    castStart: get<HTMLButtonElement>('cast-start'),
    toolsOpen: () => layout.isOpen(),
    rodTip: () => motion.point(),
    onCastStart: () => begin(),
    onChange: () => render(),
  });
  const layout = mountFishingLayout(session, place, () => {
    controls.pause();
    render();
  });
  const collections = mountFishingCollections();
  const motion = mountMotionFishing({
    stage: stage.stage,
    plane: get('game'),
    settings: get('gear-page-supplies'),
    readySlot: ready,
    getRun: () => session.getSnapshot().fishing.active,
    canPlay: () =>
      place.get() === 'river' && !layout.isOpen() && !document.hidden,
    isPaused: () => controls.paused(),
    previewAim: (preview) => aim.set(preview),
    // One swing starts and casts a motion run: nothing is spent before it.
    cast: (swingDirection, power) => {
      if (session.getSnapshot().fishing.active) return false;
      if (!atShore(location.value as SpotId, companion.value)) {
        notify('先让猫走到岸边，再甩竿。');
        return false;
      }
      direction.value = String(swingDirection);
      const begun = session.execute({
        type: 'FISH_BEGIN',
        catId: companion.value,
        baitId: bait.value as BaitId,
        direction: swingDirection,
        aimDepth: Number(depth.value),
        spotId: location.value as SpotId,
        mode: 'motion',
      });
      const run = session.getSnapshot().fishing.active;
      if (!begun.ok || !run) {
        report(begun, '');
        return false;
      }
      const result = session.execute({
        type: 'FISH_CAST',
        runId: run.id,
        power,
      });
      if (result.ok) controls.resume();
      else controls.pause();
      report(result, `甩竿力度 ${power}% · 拿稳鱼竿，等"！"再上扬。`);
      render();
      return result.ok;
    },
    strike: () => {
      const run = session.getSnapshot().fishing.active;
      if (run?.mode === 'motion')
        session.execute({ type: 'FISH_STRIKE', runId: run.id });
    },
    vibrate: (pattern) => feedback.pulse(pattern),
    onChange: () => render(),
  });
  function enterAtSpot(spotId: SpotId, catId: string) {
    const run = session.getSnapshot().fishing.active;
    location.value = run?.spotId ?? spotId;
    session.select(run?.catId ?? catId);
    layout.close();
    if (!stage.showRiver()) return;
    root.hidden = false;
    render();
    notify(
      run
        ? '回到这一竿，准备好后继续操作。'
        : '先选择落点，再准备抛竿；也可开启体感瞄准。',
    );
  }
  function begin() {
    layout?.close();
    if (!atShore(location.value as SpotId, companion.value)) {
      onNeedTravel(location.value as SpotId);
      return;
    }
    if (!stage.showRiver()) return;
    const result = session.execute({
      type: 'FISH_BEGIN',
      catId: companion.value,
      baitId: bait.value as BaitId,
      direction: Number(direction.value),
      aimDepth: Number(depth.value),
      spotId: location.value as SpotId,
    });
    report(result, '落点已锁定，按住按钮蓄力，松开抛竿。');
  }
  get('travel-to-spot').addEventListener('click', () => {
    const spotId = location.value as SpotId;
    const result = session.execute({
      type: 'TRAVEL_TO_FISHING_SPOT',
      catId: companion.value,
      spotId,
    });
    report(
      result,
      `出发去${SPOTS[spotId].name}。猫咪会按城市时间逐格步行，到岸后再开始钓鱼。`,
    );
    if (result.ok) {
      layout.close();
      onNeedTravel(spotId);
    }
  });
  get('visit-river').addEventListener('click', () => {
    root.hidden = false;
    render();
  });
  get('visit-city').addEventListener('click', () => {
    layout?.close();
    root.hidden = true;
    controls.pause();
    render();
  });
  root.querySelectorAll<HTMLButtonElement>('[data-bait]').forEach((button) =>
    button.addEventListener('click', () => {
      bait.value = button.dataset.bait!;
      render();
    }),
  );
  direction.addEventListener('input', render);
  depth.addEventListener('input', render);
  location.addEventListener('change', () => {
    const spotId = location.value as SpotId;
    if (!atShore(spotId, companion.value)) {
      layout.close();
      onNeedTravel(spotId);
    }
    render();
  });
  companion.addEventListener('change', () => session.select(companion.value));
  bait.addEventListener('change', render);
  get('use-can').addEventListener('click', () =>
    report(
      session.execute({ type: 'USE_CAN', catId: companion.value }),
      `吃了罐头，恢复最多 ${FISHING.supplies.canEnergy} 体力。`,
    ),
  );
  get('recycle-trash').addEventListener('click', () =>
    report(
      session.execute({ type: 'RECYCLE_TRASH' }),
      `回收了一件垃圾，获得 ${FISHING.supplies.trashCoins} 金币。`,
    ),
  );
  get('invite-pepper').addEventListener('click', () =>
    report(
      session.execute({ type: 'INVITE_PEPPER' }),
      'Pepper 来了！它喜欢鲈鱼和鲶鱼。',
    ),
  );
  get('fish-rest').addEventListener('click', () =>
    report(
      session.execute({ type: 'REST_CAT', catId: companion.value }),
      `伙伴开始休息。城市每过去 ${REST.tickMinutes} 分钟恢复 ${REST.recovery} 体力，可以换只猫继续钓鱼。`,
    ),
  );
  root
    .querySelectorAll<HTMLButtonElement>('[data-buy-bait]')
    .forEach((button) =>
      button.addEventListener('click', () =>
        report(
          session.execute({
            type: 'BUY_BAIT',
            baitId: button.dataset.buyBait as 'WORM' | 'SHRIMP',
          }),
          '鱼饵已放进包里。',
        ),
      ),
    );
  get('fish-pause').addEventListener('click', () => {
    controls.togglePause();
    render();
  });
  get('fish-cancel').addEventListener('click', () => {
    const run = session.getSnapshot().fishing.active;
    if (run)
      report(
        session.execute({ type: 'FISH_CANCEL', runId: run.id }),
        '收好鱼竿，稍后再来。体力和已用鱼饵不退回。',
      );
  });
  session.subscribe(() => {
    render();
  });
  root.hidden = !session.getSnapshot().fishing.active;
  render();
  return {
    enterAtSpot,
    tools: { close: layout.close, openTalk: layout.openTalk } satisfies Tools,
    aim,
    fishingClock: controls.clock,
  };
}
