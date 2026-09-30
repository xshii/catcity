import type { PlaceState } from './place';
import type { GameSession } from '../../application';
import { mountAngling } from '../fishing/panel';
import { mountCity } from '../city/panel';
import { mountClockSpeed } from './clock-speed';
import { mountCompanionship } from '../companion/journal';
import { mountPetting } from '../petting/panel';
import { mountBreeding } from '../cats/breed';
import { createCatsView } from '../cats/view-state';
import { mountDetail } from '../cats/detail';
import { mountInvite } from '../cats/invite';
import { mountRoster } from '../cats/roster';
import { toViewModel } from './model';
import { bondNote } from './bond';
import { withMoodNote } from './mood';
import { ERROR_MESSAGES } from './errors';
import { mountSettings } from './settings';
import type { Trace } from '../../platform/device-log';

const TALK_RETRY = '暂时没能完成对话，请再试一次。';

export function mountPanel(
  session: GameSession,
  place: PlaceState,
  trace: Trace,
) {
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <main class="shell">
      <section id="save-recovery" class="save-recovery" hidden><div id="storage-error" role="alert" hidden></div><button id="reset-demo" hidden>清除旧试玩存档，开始新版</button></section>
      <div class="layout"><section class="map-card"><div id="map-heading" class="map-heading"><div class="scene-tabs"><button id="visit-city" aria-pressed="true">小城</button><button id="visit-river" aria-pressed="false">河畔</button></div><span id="clock"></span><button id="clock-speed" class="quiet"></button></div>
        <section id="city-guide" class="city-guide" aria-label="小城玩法指引"><ol class="city-steps"><li data-city-step="0">猫咪入住</li><li data-city-step="1">猫咖有客人</li><li data-city-step="2">共同回忆</li></ol><h2 id="city-goal"></h2><p id="city-instruction"></p><button id="city-action" class="primary"></button><p id="cafe-income" class="cafe-income" hidden></p></section>
        <section id="city-save" class="city-save" aria-label="保存"><p>进度会自动保存在这台设备；也可以现在手动保存一次。</p><button id="save" class="quiet">保存进度</button></section>
        <div class="city-map-hint"><span id="city-hint" aria-live="polite"></span><button id="city-overview" class="quiet" aria-pressed="false">总览地图</button></div><div id="game"></div></section>
        <aside hidden><section class="card cat-card"><p class="eyebrow">YOUR LITTLE COMPANION</p><div class="cat-heading"><div class="cat-avatar" aria-hidden="true"><svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><path d="M12 31L10 9l17 12h10L54 9l-2 22" fill="#efdbb2"/><path d="M15 26l-2-12 10 9M41 23l10-9-2 12" fill="#dda996"/><ellipse cx="32" cy="34" rx="23" ry="20" fill="#f7e7c6"/><g class="portrait-eyes" fill="#605942"><ellipse cx="23" cy="32" rx="2" ry="3"/><ellipse cx="41" cy="32" rx="2" ry="3"/></g><path d="M29 38h6l-3 4z" fill="#ca9785"/><path d="M32 42v3m0 0l-4 2m4-2l4 2" fill="none" stroke="#a38a6b" stroke-linecap="round"/><ellipse cx="17" cy="39" rx="4" ry="2" fill="#e8bba4"/><ellipse cx="47" cy="39" rx="4" ry="2" fill="#e8bba4"/></svg></div><div><h2 id="cat-name">认识 Mochi</h2><span class="pill" id="mood" role="img" aria-label="第一位居民">第一位居民</span><small id="mood-hint" class="mood-hint" hidden></small></div><span class="tiny-heart">♡</span></div><p id="cat-description">点击地图上的奶油色小猫，或者在这里打个招呼。</p><button id="meet-cat" class="quiet">认识 Mochi</button>
        <div id="cat-detail" hidden><div class="traits" id="traits"></div><p id="reunion" class="reunion"></p><div id="bond-level" class="bond-level" role="img"><span id="bond-hearts" class="bond-hearts"></span><strong id="bond-name"></strong><progress id="bond-progress"></progress><small id="bond-next" class="bond-next"></small><small id="bond-news" class="bond-news" hidden></small></div><p class="bond" id="bond"></p><div id="dialogue" data-testid="dialogue" class="speech" aria-live="polite"></div>
        <div class="quick-talk"><button data-message="今天有点累">今天有点累</button><button data-message="今天很开心">有个好消息</button><button data-message="还记得我们钓鱼吗？">聊聊我们的回忆</button></div>
        <form id="dialogue-form"><label for="message">和 Mochi 说句话</label><div class="input-row"><input id="message" maxlength="500" placeholder="今天想和它说些什么？" autocomplete="off" required /><button id="send" type="submit" aria-label="发送">↗</button></div></form></div>
        </section>
        <section class="card journal"><div class="journal-heading"><p class="eyebrow">OUR LITTLE MEMORIES</p><span>✧</span></div><h2>一起经历的事</h2><p id="journal-count" class="journal-count"></p><p id="memory-empty">第一次一起去的地方，<br>会成为故事的第一页。</p><article id="memory-card" hidden><div class="memory-art" aria-hidden="true">☀<span>≈ 𓆝 ≈</span></div><small id="memory-date"></small><strong id="memory-fact"></strong><p id="memory-caption"></p></article></section>
        </aside></div>
      <div id="notice" role="status"></div>
    </main>`;
  const get = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  // Set once the fishing screen is mounted: its catch card gives way to a notice.
  let said = () => {};
  const notify = (message: string) => {
    const notice = get('notice');
    notice.textContent = message;
    said();
    // Each message fades after a while (layout.css); a new one starts it over, which
    // needs a style flush between removing and adding the class.
    notice.classList.remove('fading');
    void notice.offsetWidth;
    notice.classList.add('fading');
  };
  // What the cats panel shows besides the world: the level a chat reached stays on the
  // card above the chat; which detail is open, and its sections.
  const cats = createCatsView();
  const render = () => {
    const model = toViewModel(session.getSnapshot(), session.selectedEntity);
    get('coins').textContent = model.coins;
    get('clock').textContent = `第 ${model.day} 天 · ${model.time}`;
    get('save-recovery').hidden = !session.storageError;
    get('reset-demo').hidden = !session.saveRejected;
    get('storage-error').hidden = !session.storageError;
    get('storage-error').textContent = session.storageError ?? '';
  };
  session.subscribe(render);
  get('reset-demo').addEventListener('click', () => {
    session.resetDemo();
    notify('已开始新版试玩。');
  });
  get('save').addEventListener('click', () => {
    notify(
      session.save() ? '进度已保存在这台设备。' : '保存未完成，请查看提示。',
    );
    render();
  });
  const talk = async (message: string) => {
    const catId = session.selectedEntity;
    const send = get<HTMLButtonElement>('send');
    if (!catId || send.disabled || !message.trim()) return;
    send.disabled = true;
    try {
      const before = session.getSnapshot();
      const result = await session.talk(catId, message);
      if (result.ok) {
        get<HTMLInputElement>('message').value = '';
        const after = session.getSnapshot();
        const name = after.cats.find((cat) => cat.id === catId)?.name ?? '小猫';
        const note = bondNote(before, after, catId);
        cats.dispatch({ type: 'chatted', catId, note });
        notify(withMoodNote(`${name} 轻轻动了动耳朵，回应了你。`, note));
        render();
      } else
        notify(
          result.error === 'INVALID_INTERACTION' ||
            result.error === 'STALE_DIALOGUE'
            ? TALK_RETRY
            : ERROR_MESSAGES[result.error],
        );
    } catch {
      notify(TALK_RETRY);
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
  // One gear on every page, right after the scene bar (2026-09-30).
  const settings = mountSettings({ place, after: get('map-heading') });
  const angling = mountAngling(
    session,
    place,
    notify,
    (spotId) => city.focusWaterway(spotId),
    trace,
    {
      game: get('game'),
      visitCity: get('visit-city'),
      visitRiver: get('visit-river'),
      notice: get('notice'),
      settings,
    },
  );
  said = angling.said;
  const city = mountCity({
    session,
    place,
    tools: angling.tools,
    notify,
    enterFishing: angling.enterAtSpot,
    talk: (message) => void talk(message),
    elements: {
      stage: angling.stage,
      guide: get('city-guide'),
      hint: get('city-hint'),
      overview: get('city-overview'),
      outing: get('city-panel-outing'),
    },
  });
  // The roster heads the cats panel's first page, before petting, kittens and invites;
  // a cat's detail takes its place. The detail listens first: it shows the roster again
  // before the roster takes the focus back.
  mountDetail({
    session,
    place,
    view: cats,
    card: document.querySelector<HTMLElement>('.cat-card')!,
    page: get('cats-page-roster'),
  });
  mountRoster({ session, place, view: cats, page: get('cats-page-roster') });
  const petting = mountPetting({
    session,
    place,
    notify,
    tools: angling.tools,
    roster: get('cats-page-roster'),
    layer: document.querySelector<HTMLElement>('.shell')!,
    settings,
  });
  mountBreeding({ session, roster: get('cats-page-roster') });
  // The way to invite a new companion ends the roster, after petting and the kitten list.
  mountInvite({ session, notify, roster: get('cats-page-roster') });
  // The scene switch and the map card follow the place.
  const showPlace = () => {
    const river = place.get() === 'river';
    get('visit-city').setAttribute('aria-pressed', String(!river));
    get('visit-river').setAttribute('aria-pressed', String(river));
    document.querySelector('.map-card')!.classList.toggle('river-mode', river);
  };
  place.subscribe(showPlace);
  showPlace();
  const clockSpeed = mountClockSpeed(
    place,
    get<HTMLButtonElement>('clock-speed'),
  );
  notify(
    session.resumed
      ? '欢迎回来。小城一直在等你。'
      : '欢迎来到小城。这里有一只猫，正在慢慢认识你。',
  );
  render();
  return {
    clockSpeed,
    notify,
    city,
    aim: angling.aim,
    catMoves: angling.catMoves,
    fishingClock: angling.fishingClock,
    pettingClock: petting.clock,
  };
}
