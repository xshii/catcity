import { TIME_SCALE } from '../time-scale';
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
import type { ErrorCode } from '../../core';
import { mountFishingFeedback } from './feedback';
import { mountFishingStage } from './stage';
import { renderFishingCatalog } from './catalog';
import { mountFishingLayout } from '../shell/layout';
import { restMinutesLeft } from '../shell/model';
import { mountFishingCollections } from './collections';
import { mountFishingMotion } from '../motion/motion';
import { onShore } from '../../core/city';

const CAST_COST = FISHING.cast.staminaCost;
const REST = CARE.rest;

export function mountAngling(
  session: GameSession,
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
  const stage = mountFishingStage(session, {
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
  root.innerHTML = `
    <div id="river-tools" hidden><div class="river-tools-heading"><h2 id="river-tools-title"></h2><button id="river-tools-close" aria-label="返回钓鱼">返回钓鱼 ↓</button></div>
    <section id="river-panel-gear" role="tabpanel" aria-labelledby="river-tab-gear" hidden>
    <div class="angling-title"><div><p class="eyebrow">ONE MORE CAST, TOGETHER</p><h2>钓具与鱼篓</h2></div><span id="fishing-level"></span></div>
    <div class="fishing-settings"><p id="fishing-resources"></p><button id="haptics-toggle" aria-pressed="false">震动</button></div>
    <div id="bait-tray" class="bait-tray"><button data-bait="BREAD">🍞<span>面包<small>常见鱼 · 无限</small></span></button><button data-bait="WORM">🪱<span>蚯蚓<small>鲈鱼 / 锦鲤</small></span></button><button data-bait="SHRIMP">🦐<span>虾饵<small>鲶鱼 / 月光鲤</small></span></button></div>
    <div class="fishing-prep"><label>钓点<select id="fish-location"></select></label><label>同行伙伴<select id="fish-companion"></select></label><label class="bait-select">鱼饵<select id="fish-bait"></select></label></div>
    <label class="direction-label">抛投方向 <output id="direction-value"></output><input type="range" id="fish-direction" min="-${FISHING.input.maxDirection}" max="${FISHING.input.maxDirection}" step="5" value="-30" aria-label="抛投方向"></label>
    <label class="direction-label depth-label">近远落点 <output id="depth-value"></output><input type="range" id="fish-depth" min="0" max="100" step="5" value="50" aria-label="近远落点"></label>
    <p id="companion-specialty" class="fishing-clue"></p><p id="spot-hint" class="fishing-clue"></p><div id="spot-unlocks" class="spot-unlocks"></div>
    <div class="fishing-actions"><button id="cast-start" class="primary">准备抛竿 ↗ · ${CAST_COST} 体力</button><button id="fish-rest">让这只猫休息</button><button id="invite-pepper">邀请 Pepper</button></div>
    <div id="angling-live" class="scene-console" hidden><div class="bar-heading"><strong id="angling-phase"></strong><span id="angling-status"></span></div><p id="angling-instruction"></p>
      <div id="angling-bar" class="angling-bar" role="meter" aria-label="钓鱼操作条" aria-valuemin="0" aria-valuemax="100"><span id="angling-green" class="angling-green"></span><i id="angling-cursor" class="angling-cursor"></i></div>
      <div class="fight-meters"><label>收线 <progress id="fish-progress" max="100" value="0"></progress></label><label>鱼线 <progress id="line-health" max="100" value="100"></progress></label></div>
      <button id="fish-control" class="primary fish-control" aria-label="钓鱼操作"><span class="reel-icon" aria-hidden="true">◎</span><span id="control-label">按住蓄力，松开抛竿</span></button>
      <div class="fishing-actions"><button id="fish-pause">暂停</button><button id="fish-cancel">收竿离开</button></div>
    </div>
    <details class="bait-shop"><summary>补充鱼饵</summary><div class="fishing-actions"><button data-buy-bait="WORM">买蚯蚓 · ${BAITS.WORM.price} 金币</button><button data-buy-bait="SHRIMP">买虾饵 · ${BAITS.SHRIMP.price} 金币</button></div><p>面包无限供应。星级表示鱼种难度；售价按鱼种固定，重量记录个人最佳。</p></details></section>
    <section id="river-panel-bag" role="tabpanel" aria-labelledby="river-tab-bag" hidden>
    <details id="fish-bag" open><summary>鱼篓 <span id="bag-count"></span> · 卖鱼或送给伙伴</summary><p id="fish-tastes"></p><div id="fish-inventory"></div></details>
    <details id="fish-supply-detail" open><summary>钓获补给与垃圾</summary><p id="fish-supplies"></p><div class="fishing-actions"><button id="use-can">吃罐头 · +${FISHING.supplies.canEnergy} 体力</button><button id="recycle-trash">回收垃圾 · +${FISHING.supplies.trashCoins} 金币</button></div><p class="fishing-clue">0–${FISHING.trash.maxStars} 星鱼局失败时有概率钓到垃圾；主动收竿不会获得。面包饵轻抛可钓到罐头或金币袋。</p></details>
    </section><section id="river-panel-atlas" role="tabpanel" aria-labelledby="river-tab-atlas" hidden><details id="fish-atlas"><summary>鱼类图鉴 <span id="atlas-count"></span> · 星级、习性与线索</summary><div id="atlas-list" class="atlas-list"></div></details></section><section id="river-panel-chat" role="tabpanel" aria-labelledby="river-tab-chat" hidden><p class="desktop-chat-hint">伙伴就在右侧，和它聊聊今天的收获吧。</p></section></div><p id="fish-result" class="fish-result river-live-result" role="status"></p>`;
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
  restActions.append(
    get('fish-rest'),
    get('time-forward'),
    get('invite-pepper'),
  );
  get('river-roster').append(restActions);
  mountFishingFeedback(session, stage.stage);
  const location = get<HTMLSelectElement>('fish-location');
  const companion = get<HTMLSelectElement>('fish-companion');
  const bait = get<HTMLSelectElement>('fish-bait');
  const direction = get<HTMLInputElement>('fish-direction');
  const depth = get<HTMLInputElement>('fish-depth');
  const control = get<HTMLButtonElement>('fish-control');
  let pressed = false;
  let paused = true;
  let detailsKey = '';
  let previousRun: string | undefined;
  const errors: Partial<Record<ErrorCode, string>> = {
    CAT_RESTING: '这只猫正在休息，换个伙伴或快进城市时间吧。',
    CAT_BUSY: '先收好这只猫的鱼竿再休息。',
    STAMINA_FULL: '这只猫现在体力充足。',
    SPOT_LOCKED: '这个钓点还没解锁，看看下面的条件。',
    TRAVEL_REQUIRED: '先在城市地图让这只猫走到水域岸边。',
    ALREADY_AT_SPOT: '已经在这个钓点了。',
    LOW_STAMINA: '体力不足，休息一小时再来吧。',
    NO_BAIT: '鱼饵用完了，可以补充或换成免费面包。',
    BAG_FULL: '鱼篓满了，卖出或送出几条鱼再来吧。',
    ALREADY_FISHING: '先完成或收起这一竿。',
    INSUFFICIENT_COINS: '金币不足，先卖鱼或使用免费面包吧。',
  };
  const report = (
    result: ReturnType<GameSession['execute']>,
    success: string,
  ) => notify(result.ok ? success : (errors[result.error] ?? result.error));
  const render = () => {
    const world = session.getSnapshot();
    const f = world.fishing;
    const run = f.active;
    if (run?.id !== previousRun) {
      paused = true;
      pressed = false;
      previousRun = run?.id;
      if (run) root.hidden = false;
    }
    const active = !!run;
    const selectedCat =
      world.cats.find(
        (cat) => cat.id === (run?.catId ?? session.selectedEntity),
      ) ?? world.cats[0]!;
    const energy = selectedCat.needs.energy;
    get('scene-ready').hidden = active;
    get<HTMLButtonElement>('cast-start').disabled =
      active || !!selectedCat.rest || energy < CAST_COST;
    get<HTMLButtonElement>('fish-rest').disabled =
      !!selectedCat.rest || energy === 100 || run?.catId === selectedCat.id;
    get('fish-rest').textContent = selectedCat.rest
      ? `${selectedCat.name} 休息中 · 剩 ${restMinutesLeft(selectedCat.rest, world.minute)} 分钟`
      : `休息 ${REST.minutes / 60} 小时 · +${(REST.minutes / REST.tickMinutes) * REST.recovery} 体力`;
    for (const field of [location, companion, bait, direction, depth])
      field.disabled = active;

    get<HTMLButtonElement>('fishing').disabled =
      active || !!selectedCat.rest || energy < CAST_COST;
    get('fishing').textContent = active
      ? '正在一起钓鱼…'
      : `邀请 ${world.cats.find((cat) => cat.id === session.selectedEntity)?.name ?? 'Mochi'} 去钓鱼 ↗`;
    get('angling-live').hidden = !run;
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
      const names = {
        charge: '① 蓄力抛投',
        waiting: '② 等待咬钩',
        hook: '③ 绿色区提竿',
        fight: '④ 控制张力',
        caught: '钓到了',
        escaped: '鱼溜走了',
      };
      const instructions = {
        charge: '按住蓄力、松开抛投。绿色区落竿，会让这一竿更容易控制。',
        waiting: '浮漂动了就准备提竿，现在先松开。',
        hook: '白色游标进入绿色区间时，按一下！',
        fight: '按住增加张力，松开降低。跟着绿色区间，收线进度满就能钓上来。',
        caught: '',
        escaped: '',
      };
      get('angling-phase').textContent = names[run.phase];
      get('angling-status').textContent = paused
        ? '已暂停 · 按操作键继续'
        : run.speciesId && run.phase === 'fight'
          ? `${fishStars(fishById(run.speciesId).stars)} ${fishById(run.speciesId).behavior}`
          : `${run.power}% 力度`;
      get('angling-instruction').textContent = instructions[run.phase];
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
      control.setAttribute('aria-pressed', String(pressed));
      get('fish-pause').textContent = paused ? '继续钓鱼' : '暂停';
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
  };
  const layout = mountFishingLayout(session, () => {
    paused = true;
    pressed = false;
    render();
  });
  const collections = mountFishingCollections();
  const motion = mountFishingMotion(get('gear-page-supplies'), {
    getRun: () => session.getSnapshot().fishing.active,
    isPaused: () => paused,
    cast: (power) => {
      const run = session.getSnapshot().fishing.active;
      if (!run || run.phase !== 'charge' || layout.isOpen()) return false;
      pressed = false;
      const result = session.execute({
        type: 'FISH_CAST',
        runId: run.id,
        power,
      });
      paused = !result.ok;
      report(result, `甩竿力度 ${power}% · 留意鱼漂，准备提竿。`);
      render();
      return result.ok;
    },
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
    report(result, '落点已锁定，按当前操作提示抛竿。');
    // Only an explicit new cast arms motion; navigation and late readings do not.
    if (result.ok) motion.prepareCast();
  }
  get('fishing').addEventListener('click', () =>
    enterAtSpot(location.value as SpotId, companion.value),
  );
  const castStart = get<HTMLButtonElement>('cast-start');
  let freshCastPress = false;
  document.addEventListener('pointerdown', (event) => {
    freshCastPress =
      event.target instanceof Node && castStart.contains(event.target);
  });
  document.addEventListener('pointercancel', () => {
    freshCastPress = false;
  });
  castStart.addEventListener('click', (event) => {
    // A landing can hide the held reel button before touchend. Its synthesized
    // click must not activate the newly revealed cast button underneath it.
    const intentional = event.detail === 0 || freshCastPress;
    freshCastPress = false;
    if (intentional) begin();
  });
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
    paused = true;
    pressed = false;
    render();
  });
  root.querySelectorAll<HTMLButtonElement>('[data-bait]').forEach((button) =>
    button.addEventListener('click', () => {
      bait.value = button.dataset.bait!;
      bait.dispatchEvent(new Event('change'));
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
    paused = !paused;
    pressed = false;
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
  const down = () => {
    if (layout?.isOpen()) return;
    if (motion.useManualControl()) {
      pressed = false;
      render();
      return;
    }
    if (session.getSnapshot().fishing.active) {
      paused = false;
      pressed = true;
      render();
    }
  };
  const up = () => {
    pressed = false;
    render();
  };
  control.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    control.focus({ preventScroll: true });
    control.setPointerCapture(event.pointerId);
    down();
  });
  control.addEventListener('pointerup', up);
  control.addEventListener('pointercancel', () => {
    paused = true;
    up();
  });
  control.addEventListener('lostpointercapture', up);
  control.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      if (!event.repeat) down();
    }
  });
  control.addEventListener('keyup', (event) => {
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      up();
    }
  });
  window.addEventListener('blur', () => {
    freshCastPress = false;
    paused = true;
    up();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      freshCastPress = false;
      paused = true;
      up();
    }
  });
  /** Fishing ticks from the current real inputs; false when play is paused. */
  const tick = (scale: number): boolean => {
    const run = session.getSnapshot().fishing.active;
    if (
      !run ||
      paused ||
      document.hidden ||
      !stage.stage.classList.contains('is-river') ||
      layout?.isOpen()
    )
      return false;
    const point = motion.controlPoint();
    // Only the bite wait is sped up; hook and fight need a timely player reaction.
    const ticks = run.phase === 'waiting' ? scale : 1;
    session.execute(
      run.phase === 'hook' && point
        ? { type: 'FISH_MOTION_CONTROL', runId: run.id, ...point, ticks }
        : { type: 'FISH_CONTROL', runId: run.id, pressed, ticks },
    );
    return true;
  };
  // Browser time drives ticks; tests may take over the clock like ADVANCE_TIME.
  let manualClock = false;
  window.setInterval(() => {
    if (!manualClock) tick(TIME_SCALE);
  }, 1000 / FISHING.ticksPerSecond);
  session.subscribe(() => {
    render();
  });
  root.hidden = !session.getSnapshot().fishing.active;
  render();
  return {
    enterAtSpot,
    fishingClock: {
      setManual: (manual: boolean) => {
        manualClock = manual;
      },
      /** Runs the same tick as the interval; returns how many ticks applied. */
      step: (ticks: number) => {
        let applied = 0;
        for (let i = 0; i < ticks; i++) if (tick(1)) applied++;
        return applied;
      },
    },
  };
}
