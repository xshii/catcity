import type { Aim, AimControl, PlaceState, Tools } from '../shell/place';
import { CAT_BREEDS } from '../../content/breeds';
import type { GameSession } from '../../application';
import type { GameCommand } from '../../core';
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
  skillXp,
  spotUnlocked,
  type BaitId,
  type SpotId,
} from '../../content/fishing';
import { greenZone } from '../../minigames/angling';
import { CARE } from '../../content/care';
import { mountFishingFeedback } from './feedback';
import { mountFishingSound } from './sound';
import { mountFishingStage, type FishingShell } from './stage';
import { renderFishingCatalog } from './catalog';
import { mountFishingLayout } from '../shell/layout';
import { mountFishingCollections } from './collections';
import { motionStartup, mountMotionFishing } from '../motion/motion-fishing';
import { onShore } from '../../core/city';
import { mountFishingControls } from './controls';
import { mountFishingSettings } from './settings';
import {
  castNotice,
  fishingScreen,
  permissionNotice,
  resultShown,
  ringHeld,
} from './screen';
import {
  createFishingView,
  initialFishingView,
  motionActive,
} from './view-state';
import {
  ANGLING_MARKUP,
  BUTTON_PHASE_INSTRUCTIONS,
  BUTTON_PHASE_NAMES,
} from './template';
import { ERROR_MESSAGES } from '../shell/errors';
import { withMoodNote } from '../shell/mood';
import { outcomeNote } from '../shell/bond';
import type { Trace } from '../../platform/device-log';

const CAST_COST = FISHING.cast.staminaCost;
/** Before a run the button flow's power rests at half; it is charged in the run. */
const REST_POWER = FISHING.input.maxPower / 2;
/** A render that triggers more than this many re-renders is a state loop, not UI. */
const MAX_RENDER_PASSES = 5;

export function mountAngling(
  session: GameSession,
  place: PlaceState,
  notify: (text: string) => void,
  onNeedTravel: (spotId: SpotId) => void,
  trace: Trace,
  shell: FishingShell,
) {
  const atShore = (spotId: SpotId, catId: string) => {
    const world = session.getSnapshot();
    const cat = world.cats.find((item) => item.id === catId);
    return !!cat && !cat.walk && onShore(world.map, spotId, cat.position);
  };
  // Asked only after mounting, once the location field exists.
  const requestedSpot = () => (location.value as SpotId) || 'POND';
  const stage = mountFishingStage(session, place, shell, {
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
  // The markup's elements by id, kept while the layout moves them into its panels.
  const owned = new Map(
    Array.from(root.querySelectorAll<HTMLElement>('[id]'), (element) => [
      element.id,
      element,
    ]),
  );
  const get = <T extends HTMLElement = HTMLElement>(id: string) =>
    owned.get(id) as T;
  const live = get('angling-live');
  stage.stage.append(live);
  const castStart = get<HTMLButtonElement>('cast-start');
  const ready = document.createElement('div');
  ready.id = 'scene-ready';
  ready.className = 'scene-ready';
  ready.append(castStart);
  stage.stage.append(ready);
  const location = get<HTMLSelectElement>('fish-location');
  const companion = get<HTMLSelectElement>('fish-companion');
  const bait = get<HTMLSelectElement>('fish-bait');
  const direction = get<HTMLInputElement>('fish-direction');
  const depth = get<HTMLInputElement>('fish-depth');
  const control = get<HTMLButtonElement>('fish-control');
  const bar = get('angling-bar');
  const green = get('angling-green');
  const pause = get('fish-pause');
  const invite = get('invite-pepper');
  /** The FISH_BEGIN the panel's choices ask for; the button flow leaves `mode` out. */
  const beginCommand = (castDirection: number) =>
    ({
      type: 'FISH_BEGIN',
      catId: companion.value,
      baitId: bait.value as BaitId,
      direction: castDirection,
      aimDepth: Number(depth.value),
      spotId: requestedSpot(),
    }) satisfies GameCommand;
  let detailsKey = '';
  let aimKey = '';
  let aimPower = REST_POWER;
  // How the run that just ended changed its cat's mood band; read from the change itself.
  let previousWorld = session.getSnapshot();
  let resultMood = { runId: '', note: '' };
  const aimListeners = new Set<() => void>();
  // Every switchable state of the fishing screen (spec 015): one store, one render.
  const view = createFishingView(initialFishingView(motionStartup()));
  view.dispatch({ type: 'place', place: place.get() });
  view.dispatch({
    type: 'run',
    runId: session.getSnapshot().fishing.active?.id ?? null,
  });
  const settings = mountFishingSettings({
    view,
    plane: shell.game,
    layer: root,
    choose: (mode) => motion.choose(mode),
  });
  const feedback = mountFishingFeedback(session, stage.stage, settings.haptics);
  mountFishingSound(session, view, settings.sound);
  const report = (
    result: ReturnType<GameSession['execute']>,
    success: string,
  ) => notify(result.ok ? success : ERROR_MESSAGES[result.error]);
  // Rendering applies state and never changes it; a change during a render (a listener
  // reacting to it) queues another pass, so the last pass always shows the latest state.
  let rendering = false;
  let again = false;
  const render = () => {
    if (rendering) {
      again = true;
      return;
    }
    rendering = true;
    try {
      for (let pass = 0; pass === 0 || again; pass++) {
        if (pass === MAX_RENDER_PASSES)
          throw new Error('Fishing render keeps changing its own state');
        again = false;
        renderOnce();
      }
    } finally {
      rendering = false;
    }
  };
  const renderOnce = () => {
    const world = session.getSnapshot();
    const f = world.fishing;
    const run = f.active;
    const state = view.get();
    const screen = fishingScreen(state, run ?? null);
    const active = !!run;
    const resultNote =
      f.lastResult?.runId === resultMood.runId ? resultMood.note : '';
    const selectedCat =
      world.cats.find(
        (cat) => cat.id === (run?.catId ?? session.selectedEntity),
      ) ?? world.cats[0]!;
    const energy = selectedCat.needs.energy;
    ready.hidden = !screen.readyToCast;
    for (const field of [location, companion, bait, direction, depth])
      field.disabled = active;

    live.hidden = !screen.console;
    live.dataset.mode = screen.consoleMode ?? '';
    const key = JSON.stringify([
      f.xp,
      f.supplies,
      energy,
      f.baits,
      f.inventory,
      f.atlas,
      f.lastResult,
      resultNote,
      world.cats.map((cat) => [
        cat.id,
        cat.fishGift,
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
        `经验 ${f.xp}${level < FISHING.skill.maxLevel ? ` / ${skillXp(level + 1)} 升级` : ' · 已满级'} · 等级提高，绿色区间更宽`;
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
        `${SPOTS[requestedSpot()].hint}。力度控制远近，方向决定落点。`;
      get('spot-unlocks').textContent = SPOT_IDS.slice(1)
        .map(
          (id) =>
            `${SPOTS[id].name}：${spotUnlocked(id, f.xp, discovered) ? '已开放 ✓' : `钓技 ${level}/${SPOTS[id].level} 级 · 图鉴 ${discovered}/${SPOTS[id].species} 种`}`,
        )
        .join(' → ');
      invite.hidden = world.cats.some((cat) => cat.definitionId === 'PEPPER');
      const cat = world.cats.find((cat) => cat.id === companion.value)!;
      get('companion-specialty').textContent =
        `${cat.name} · ${CAT_BREEDS[cat.breedId].name}：${CAT_BREEDS[cat.breedId].fishingHint}。鱼饵、落点和钓点条件仍需满足。`;
      renderFishingCatalog(
        get,
        world,
        cat,
        (command, message) => {
          const before = session.getSnapshot();
          const result = session.execute(command);
          report(
            result,
            command.type === 'GIFT_FISH'
              ? withMoodNote(
                  message,
                  outcomeNote(before, session.getSnapshot(), command.catId),
                )
              : message,
          );
        },
        resultNote,
      );
    }
    if (run) {
      get('angling-phase').textContent = BUTTON_PHASE_NAMES[run.phase];
      get('angling-status').textContent = state.paused
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
      green.style.left = `${zone.low}%`;
      green.style.width = `${zone.high - zone.low}%`;
      get('angling-cursor').style.left = `${value}%`;
      bar.setAttribute('aria-valuenow', String(value));
      bar.dataset.phase = run.phase;
      bar.dataset.low = String(zone.low);
      bar.dataset.high = String(zone.high);
      get<HTMLProgressElement>('fish-progress').value = run.progress;
      get<HTMLProgressElement>('line-health').value = run.lineHealth;
      control.setAttribute('aria-pressed', String(state.pressed));
      pause.textContent = screen.pauseLabel;
    }
    const destination = requestedSpot();
    stage.render(
      world,
      selectedCat.id,
      destination,
      resultNote,
      resultShown(state, run ?? null, world.fishing.lastResult),
    );
    layout.refresh();
    settings.apply(screen.settings);
    motion.apply(screen, run ?? null);
    collections.refresh();
    const atDestination = atShore(destination, selectedCat.id);
    layout.travelDuration.textContent = atDestination
      ? `已在${SPOTS[destination].name}`
      : selectedCat.walk
        ? `步行中 · 剩 ${selectedCat.walk.route.length} 格 · 每格消耗 ${CARE.walkEnergyPerTile} 体力`
        : `需要先走到岸边 · 耗时取决于道路 · 每格消耗 ${CARE.walkEnergyPerTile} 体力`;
    layout.travelButton.disabled = active || atDestination;
    layout.travelButton.textContent = atDestination
      ? '已经抵达'
      : '出发去钓点 →';
    castStart.disabled = active || energy < CAST_COST || !atDestination;
    castStart.textContent = atDestination
      ? `准备抛竿 ↗ · 抛出耗 ${CAST_COST} 体力`
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
  const currentAim = (): Aim => {
    // Only motion aiming sets the power before a run; the button flow charges it.
    const live = motionActive(view.get());
    return {
      spotId: requestedSpot(),
      direction: Number(direction.value),
      depth: Number(depth.value),
      power: live ? aimPower : REST_POWER,
      live,
    };
  };
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
    ringCentre: () => motion.ringCentre(),
  };
  const controls = mountFishingControls({
    session,
    view,
    control,
    castStart,
    rodTip: () => motion.point(),
    onCastStart: () => begin(),
  });
  const layout = mountFishingLayout(session, place, () =>
    view.dispatch({ type: 'tools', open: layout.isOpen() }),
  );
  const collections = mountFishingCollections(get);
  const motion = mountMotionFishing({
    view,
    plane: shell.game,
    getRun: () => session.getSnapshot().fishing.active,
    previewAim: (preview) => aim.set(preview),
    // One swing starts and casts a motion run: nothing is spent before it.
    cast: (swingDirection, power) => {
      if (session.getSnapshot().fishing.active) return false;
      if (!atShore(requestedSpot(), companion.value)) {
        notify('先让猫走到岸边，再甩竿。');
        return false;
      }
      // Cast where the ring showed it would land: the slider keeps the aim in its steps.
      direction.value = String(swingDirection);
      const begun = session.execute({
        ...beginCommand(Number(direction.value)),
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
      view.dispatch({ type: result.ok ? 'resume' : 'pause' });
      // A cast is announced with the world change, as in the button flow.
      if (!result.ok) report(result, '');
      return result.ok;
    },
    strike: () => {
      const run = session.getSnapshot().fishing.active;
      if (run?.mode === 'motion')
        session.execute({ type: 'FISH_STRIKE', runId: run.id });
    },
    vibrate: (pattern) => feedback.pulse(pattern),
    trace,
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
        : '先选择落点，再准备抛竿；钓鱼方式可在设置里切换。',
    );
  }
  function begin() {
    layout.close();
    if (!atShore(requestedSpot(), companion.value)) {
      onNeedTravel(requestedSpot());
      return;
    }
    if (!stage.showRiver()) return;
    const result = session.execute(beginCommand(Number(direction.value)));
    report(result, '落点已锁定，按住按钮蓄力，松开抛竿。');
  }
  layout.travelButton.addEventListener('click', () => {
    const spotId = requestedSpot();
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
  // Every way in or out of the river passes through the place state: leaving it closes
  // the tools, pauses input and redraws, so nothing of the river stays on screen.
  place.subscribe((next) => {
    if (next === 'river') root.hidden = false;
    else {
      layout.close();
      root.hidden = true;
      // Leaving with the rod still uncast gives it up: nothing was paid, and the cat
      // goes back to recovering. A cast run waits for the player to come back.
      const run = session.getSnapshot().fishing.active;
      if (run?.phase === 'charge')
        session.execute({ type: 'FISH_CANCEL', runId: run.id });
    }
    view.dispatch({ type: 'place', place: next });
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
    const spotId = requestedSpot();
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
  invite.addEventListener('click', () =>
    report(
      session.execute({ type: 'INVITE_PEPPER' }),
      'Pepper 来了！它喜欢鲈鱼和鲶鱼。',
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
  pause.addEventListener('click', () =>
    view.dispatch({ type: 'toggle-pause' }),
  );
  get('fish-cancel').addEventListener('click', () => {
    const run = session.getSnapshot().fishing.active;
    if (run)
      report(
        session.execute({ type: 'FISH_CANCEL', runId: run.id }),
        '收好鱼竿，稍后再来。体力和已用鱼饵不退回。',
      );
  });
  // A world change or a view change: either way, one render applies the screen.
  session.subscribe(() => {
    const world = session.getSnapshot();
    const ended = world.fishing.lastResult;
    if (
      ended &&
      ended.runId === previousWorld.fishing.active?.id &&
      ended.runId !== previousWorld.fishing.lastResult?.runId
    )
      resultMood = {
        runId: ended.runId,
        note: outcomeNote(previousWorld, world, ended.catId),
      };
    const held = ringHeld(previousWorld.fishing.active, world.fishing.active);
    const cast = castNotice(previousWorld.fishing.active, world.fishing.active);
    previousWorld = world;
    if (cast) notify(cast);
    stage.follow(session.getSnapshot());
    const runId = session.getSnapshot().fishing.active?.id ?? null;
    if (runId && runId !== view.get().runId) root.hidden = false;
    const before = view.get();
    view.dispatch({ type: 'run', runId });
    if (held) view.dispatch({ type: 'guide', did: 'fight' });
    if (view.get() === before) render();
  });
  let seenView = view.get();
  view.subscribe((state) => {
    const refused = permissionNotice(seenView, state);
    seenView = state;
    if (refused) notify(refused);
    trace('view', { ...state });
    render();
  });
  trace('view', { ...view.get() });
  root.hidden = !session.getSnapshot().fishing.active;
  // A run restored from the save takes the scene to the river before the first render.
  stage.follow(session.getSnapshot());
  render();
  return {
    stage: stage.stage,
    enterAtSpot,
    tools: { close: layout.close, openTalk: layout.openTalk } satisfies Tools,
    aim,
    fishingClock: controls.clock,
  };
}
