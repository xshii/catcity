import type { GameSession } from '../application/session';
import { toViewModel } from './model';

export function mountPanel(session: GameSession) {
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <main class="shell">
      <header class="topbar"><a class="brand" href="./"><span class="brand-mark">C</span><span>CAT CITY<small>A LITTLE PLACE TO BELONG</small></span></a>
        <div class="top-actions"><span class="offline"><i></i> 离线也很温暖</span><button id="save" class="quiet">保存进度</button></div></header>
      <section class="intro"><div><p class="eyebrow">YOUR FIRST CHAPTER</p><h1>从一间猫咖开始。</h1><p class="subtitle">种下一点日常，等一座有猫的城市慢慢长大。</p></div>
        <div class="wallet"><span class="coin">●</span><div><small>城市金币</small><strong id="coins" data-testid="coins"></strong></div></div></section>
      <div class="layout"><section class="map-card"><div class="map-heading"><span><i class="sun"></i> 晴朗的小城</span><span id="clock"></span></div><div id="game"></div><div class="map-footer"><span id="map-hint">点击任意空地，建造第一间猫咖</span><span>10 × 10</span></div></section>
        <aside><section class="card build-card"><p class="eyebrow">01 / BUILD</p><h2>一杯咖啡，一个开始</h2><p>给小城一扇亮着灯的窗，也给猫咪一个可以停留的地方。</p><div class="building-summary"><span class="mini-house">⌂</span><div><strong>猫咪咖啡馆</strong><small>每游戏小时 +10 金币</small></div><b>300</b></div><div id="build-status" class="build-status">已选中 · 点击地图建造</div></section>
        <section class="card cat-card"><p class="eyebrow">02 / LIVE & BOND</p><div class="cat-heading"><h2 id="cat-name">认识 Mochi</h2><span class="pill" id="mood">第一位居民</span></div><p id="cat-description">那只奶油色的小猫正在四处张望。点击地图上的它，打个招呼吧。</p><div id="cat-detail" hidden><div class="traits" id="traits"></div><p class="bond" id="bond"></p><div id="dialogue" data-testid="dialogue" class="speech" aria-live="polite">它轻轻抬头，等你说些什么。</div><form id="dialogue-form"><label for="message">和 Mochi 说句话</label><div class="input-row"><input id="message" maxlength="500" placeholder="你喜欢吃鱼吗？" autocomplete="off" required /><button id="send" type="submit" aria-label="发送">↗</button></div></form></div></section>
        <button id="rest" class="rest">休息一小时 <span>让小城慢慢生活 →</span></button></aside></div>
      <div id="notice" role="status">欢迎来到 Cat City。这里的故事，从你和 Mochi 开始。</div><div id="storage-error" role="alert" hidden></div>
      <footer><span>BUILD A CITY. MAKE A FRIEND.</span><span>Cat City · 第一章</span></footer>
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
      : '已选中 · 点击地图建造';
    get('map-hint').textContent = model.cafeBuilt
      ? '猫咖已开张 · 点击 Mochi 和它聊聊'
      : '点击任意空地，建造第一间猫咖';
    get('cat-detail').hidden = !model.cat;
    get('cat-description').hidden = !!model.cat;
    get('cat-name').textContent = model.cat?.name ?? '认识 Mochi';
    get('mood').textContent = model.cat?.moodLabel ?? '第一位居民';
    if (model.cat) {
      get('traits').textContent = model.cat.personalityLabel;
      get('bond').textContent = `与你的羁绊 ${model.cat.playerBond} / 100`;
      get('dialogue').textContent =
        model.cat.memories.at(-1)?.reply ?? '它轻轻抬头，等你说些什么。';
    }
    get('storage-error').hidden = !session.storageError;
    get('storage-error').textContent = session.storageError ?? '';
  };
  session.subscribe(render);
  get('save').addEventListener('click', () => {
    notify(
      session.save() ? '进度已保存在这台设备。' : '保存未完成，请查看提示。',
    );
    render();
  });
  get('rest').addEventListener('click', () => {
    const result = session.execute({ type: 'ADVANCE_TIME', minutes: 60 });
    notify(
      result.ok ? '一小时过去了，Mochi 又找到了一个舒服的位置。' : result.error,
    );
  });
  get<HTMLFormElement>('dialogue-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const catId = session.selectedEntity;
    if (!catId) return;
    const input = get<HTMLInputElement>('message');
    const send = get<HTMLButtonElement>('send');
    if (send.disabled || !input.value.trim()) return;
    send.disabled = true;
    void session
      .talk(catId, input.value)
      .then((result) => {
        if (result.ok) {
          input.value = '';
          notify('这段小小的对话，Mochi 已经记住了。');
        } else notify(result.error);
      })
      .catch(() => notify('暂时没能完成对话，请再试一次。'))
      .finally(() => {
        send.disabled = false;
      });
  });
  render();
  return { notify };
}
