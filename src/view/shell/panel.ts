import { BUILDINGS, CITY_TIME } from '../../content/city';
import type { GameSession } from '../../application';
import { mountAngling } from '../fishing/panel';
import { mountCityGuide } from '../city/guide';
import { mountCityActions } from '../city/actions';
import { mountCompanionship } from '../companion/journal';
import { toViewModel } from './model';

export function mountPanel(session: GameSession) {
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <main class="shell">
      <header class="topbar"><a class="brand" href="./"><span class="brand-mark">c</span><span>CAT CITY<small>A LITTLE PLACE TO BELONG</small></span></a>
        <div class="top-actions"><span class="offline"><i></i> 本地陪伴 · 自动保存</span><button id="save" class="quiet">保存进度</button></div></header>
      <section class="intro"><div><p class="eyebrow">A SMALL MOMENT, TOGETHER</p><h1>小城很慢，幸好有你。</h1><p class="subtitle" id="chapter-progress"></p></div>
        <div class="wallet"><span class="coin">●</span><div><small>城市金币</small><strong id="coins" data-testid="coins"></strong></div></div></section>
      <section id="save-recovery" class="save-recovery" hidden><div id="storage-error" role="alert" hidden></div><button id="reset-demo" hidden>清除旧试玩存档，开始新版</button></section>
      <div class="layout"><section class="map-card"><div id="map-heading" class="map-heading"><div class="scene-tabs"><button id="visit-city" aria-pressed="true">小城</button><button id="visit-river" aria-pressed="false">河畔</button></div><span id="clock"></span></div>
        <section id="city-guide" class="city-guide" aria-label="小城玩法指引"><ol class="city-steps"><li data-city-step="0">猫咖开张</li><li data-city-step="1">营业收入</li><li data-city-step="2">共同回忆</li></ol><h2 id="city-goal"></h2><p id="city-instruction"></p><button id="city-action" class="primary"></button><p id="cafe-income" class="cafe-income" hidden></p></section>
        <div class="city-map-hint"><span id="city-hint">点地建设 · 点猫后选择步行目的地</span><button id="city-overview" class="quiet" aria-pressed="false">总览地图</button></div><div id="game"></div>
        <div class="map-footer"><span id="map-hint">点击空地建一间猫咖，或邀请 Mochi 出游</span><span>慢慢来 ♧</span></div></section>
        <aside><section class="card cat-card"><p class="eyebrow">YOUR LITTLE COMPANION</p><div class="cat-heading"><div class="cat-avatar" aria-hidden="true"><svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><path d="M12 31L10 9l17 12h10L54 9l-2 22" fill="#efdbb2"/><path d="M15 26l-2-12 10 9M41 23l10-9-2 12" fill="#dda996"/><ellipse cx="32" cy="34" rx="23" ry="20" fill="#f7e7c6"/><g class="portrait-eyes" fill="#605942"><ellipse cx="23" cy="32" rx="2" ry="3"/><ellipse cx="41" cy="32" rx="2" ry="3"/></g><path d="M29 38h6l-3 4z" fill="#ca9785"/><path d="M32 42v3m0 0l-4 2m4-2l4 2" fill="none" stroke="#a38a6b" stroke-linecap="round"/><ellipse cx="17" cy="39" rx="4" ry="2" fill="#e8bba4"/><ellipse cx="47" cy="39" rx="4" ry="2" fill="#e8bba4"/></svg></div><div><h2 id="cat-name">认识 Mochi</h2><span class="pill" id="mood">第一位居民</span></div><span class="tiny-heart">♡</span></div><p id="cat-description">点击地图上的奶油色小猫，或者在这里打个招呼。</p><button id="meet-cat" class="quiet">认识 Mochi</button>
        <div id="cat-detail" hidden><div class="traits" id="traits"></div><p id="reunion" class="reunion"></p><p class="bond" id="bond"></p><div id="dialogue" data-testid="dialogue" class="speech" aria-live="polite"></div>
        <div class="quick-talk"><button data-message="今天有点累">今天有点累</button><button data-message="今天很开心">有个好消息</button><button data-message="还记得我们钓鱼吗？">聊聊我们的回忆</button></div>
        <form id="dialogue-form"><label for="message">和 Mochi 说句话</label><div class="input-row"><input id="message" maxlength="500" placeholder="今天想和它说些什么？" autocomplete="off" required /><button id="send" type="submit" aria-label="发送">↗</button></div></form></div>
        <button id="fishing" class="primary"></button><p class="activity-note">按住蓄力，绿色区提竿，再慢慢收线。一起发现新钓点。</p></section>
        <section class="card journal"><div class="journal-heading"><p class="eyebrow">OUR LITTLE MEMORIES</p><span>✧</span></div><h2>一起经历的事</h2><p id="journal-count" class="journal-count"></p><p id="memory-empty">第一次一起去的地方，<br>会成为故事的第一页。</p><article id="memory-card" hidden><div class="memory-art" aria-hidden="true">☀<span>≈ 𓆝 ≈</span></div><small id="memory-date"></small><strong id="memory-fact"></strong><p id="memory-caption"></p></article></section>
        </aside></div>
      <div class="city-tools"><section class="card build-card"><div><p class="eyebrow">A PLACE TO MEET AGAIN</p><h2>给小城一扇亮着灯的窗</h2><p>猫咖 · 建造 ${BUILDINGS.CAT_CAFE.cost} 金币 · 每游戏小时收入 ${BUILDINGS.CAT_CAFE.income} 金币</p></div><div id="build-status" class="build-status"></div></section><button id="rest" class="rest">全城快进一小时 <span>营业与猫咪休息同时推进 →</span></button></div>
      <div id="notice" role="status">欢迎回来。这里有一只猫，正在慢慢认识你。</div>
      <footer><span>BUILD A CITY. MAKE A FRIEND.</span><details><summary>关于这次体验</summary><p>这是情感玩法的离线 Demo，使用规则对话，尚未接入生成式 AI。重要共同回忆与进度保存在当前浏览器，暂无跨设备同步。</p></details></footer>
    </main>`;
  const get = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const notify = (message: string) => {
    get('notice').textContent = message;
  };
  const render = () => {
    const model = toViewModel(session.getSnapshot(), session.selectedEntity);
    get('coins').textContent = model.coins;
    get('clock').textContent = `第 ${model.day} 天 · ${model.time}`;
    get('build-status').textContent = model.cafeBuilt
      ? '营业中 · 欢迎猫咪光临'
      : '到小城，点击空地建造';
    get('map-hint').textContent = model.cafeBuilt
      ? '小城的猫咖正在营业 · 随时回来坐坐'
      : '小城空地可以建造猫咖 · 河畔可以一起钓鱼';
    get('cat-detail').hidden = !model.cat;
    get('cat-description').hidden = !!model.cat;
    get('meet-cat').hidden = !!model.cat;
    get('cat-name').textContent = model.cat?.name ?? '认识 Mochi';
    get('mood').textContent = model.cat?.moodLabel ?? '第一位居民';
    if (model.cat) {
      document.querySelector('label[for=message]')!.textContent =
        `和 ${model.cat.name} 说句话`;
      document
        .querySelector('.cat-avatar')!
        .classList.toggle('gray-cat', model.cat.appearance.coat === 'gray');
      get('traits').textContent = model.cat.personalityLabel;
    }
    get('save-recovery').hidden = !session.storageError;
    get('reset-demo').hidden = !session.storageError;
    get('storage-error').hidden = !session.storageError;
    get('storage-error').textContent = session.storageError ?? '';
  };
  session.subscribe(render);
  get('reset-demo').addEventListener('click', () => {
    session.resetDemo();
    notify('已开始新版试玩。');
  });
  get('meet-cat').addEventListener('click', () => session.select('mochi'));
  get('save').addEventListener('click', () => {
    notify(
      session.save() ? '进度已保存在这台设备。' : '保存未完成，请查看提示。',
    );
    render();
  });
  get('rest').addEventListener('click', () => {
    const result = session.execute({
      type: 'ADVANCE_TIME',
      minutes: CITY_TIME.fastForwardMinutes,
    });
    notify(result.ok ? '一小时过去了，阳光落在小城的另一边。' : result.error);
  });
  const talk = async (message: string) => {
    const catId = session.selectedEntity;
    const send = get<HTMLButtonElement>('send');
    if (!catId || send.disabled || !message.trim()) return;
    send.disabled = true;
    try {
      const result = await session.talk(catId, message);
      if (result.ok) {
        get<HTMLInputElement>('message').value = '';
        const name =
          session.getSnapshot().cats.find((cat) => cat.id === catId)?.name ??
          '小猫';
        notify(`${name} 轻轻动了动耳朵，回应了你。`);
      } else notify(result.error);
    } catch {
      notify('暂时没能完成对话，请再试一次。');
    } finally {
      send.disabled = false;
    }
  };
  get<HTMLFormElement>('dialogue-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void talk(get<HTMLInputElement>('message').value);
  });
  document
    .querySelectorAll<HTMLButtonElement>('[data-message]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        void talk(button.dataset.message!);
      });
    });
  mountCompanionship(session);
  const angling = mountAngling(session, notify, (spotId) =>
    cityActions.focusWaterway(spotId),
  );
  const cityActions = mountCityActions(session, notify, angling.enterAtSpot);
  get('city-tab-outing').addEventListener('click', () =>
    cityActions.focusWaterway('POND'),
  );
  mountCityGuide(session, notify, cityActions);
  render();
  return { notify, cityActions, fishingClock: angling.fishingClock };
}
