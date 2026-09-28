import type { PlaceState } from './place';
import type { GameSession } from '../../application';
import './layout.css';
import { mountSceneNavigation } from './navigation';

/** Local navigation never owns gameplay time or progress. */
export function mountFishingLayout(
  session: GameSession,
  place: PlaceState,
  /** A tool panel opened or closed: fishing input stays paused until resumed. */
  toggled: () => void,
) {
  const get = (id: string) => document.getElementById(id)!;
  const shell = document.querySelector<HTMLElement>('.shell')!;
  const mobile = window.matchMedia('(max-width: 760px)');
  shell.classList.add('game-screen');
  const status = document.createElement('div');
  status.className = 'river-status';
  status.innerHTML = '<span id="river-coins" aria-label="城市金币"></span>';
  status.prepend(get('clock'), get('clock-speed'));
  get('map-heading').append(status);

  const groups = (
    parent: HTMLElement,
    prefix: string,
    definitions: readonly (readonly [string, string])[],
  ) => {
    const tabs = document.createElement('div');
    tabs.className = 'tool-subtabs';
    tabs.setAttribute('role', 'tablist');
    parent.append(tabs);
    const entries = definitions.map(([id, name]) => {
      const button = document.createElement('button');
      button.id = `${prefix}-tab-${id}`;
      button.textContent = name;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', `${prefix}-page-${id}`);
      const page = document.createElement('section');
      page.id = `${prefix}-page-${id}`;
      page.setAttribute('role', 'tabpanel');
      page.setAttribute('aria-labelledby', button.id);
      page.className = 'tool-page';
      tabs.append(button);
      parent.append(page);
      return { id, button, page };
    });
    const show = (id: string) =>
      entries.forEach((entry) => {
        entry.page.hidden = entry.id !== id;
        entry.button.setAttribute('aria-selected', String(entry.id === id));
      });
    entries.forEach((entry) =>
      entry.button.addEventListener('click', () => show(entry.id)),
    );
    show(definitions[0]![0]);
    return {
      pages: Object.fromEntries(entries.map((entry) => [entry.id, entry.page])),
      show,
    };
  };
  const { pages: gear } = groups(get('river-panel-gear'), 'gear', [
    ['setup', '配装'],
    ['supplies', '补充 / 设置'],
    ['info', '钓点线索'],
  ]);
  const gearRoot = get('river-panel-gear');
  gear.setup!.append(
    get('bait-tray'),
    gearRoot.querySelector('.fishing-prep')!,
    gearRoot.querySelector('.direction-label')!,
    gearRoot.querySelector('.depth-label')!,
  );
  const travel = document.createElement('div');
  travel.className = 'travel-controls';
  travel.innerHTML =
    '<span id="travel-duration"></span><button id="travel-to-spot">出发去钓点</button>';
  gear.setup!.querySelector('.fishing-prep')!.after(travel);
  const baitShop = gearRoot.querySelector<HTMLDetailsElement>('.bait-shop')!;
  baitShop.open = true;
  gear.supplies!.append(baitShop, get('haptics-toggle'));
  gear.info!.append(
    gearRoot.querySelector('.angling-title')!,
    get('fishing-resources'),
    get('companion-specialty'),
    get('spot-hint'),
    get('spot-unlocks'),
  );
  gearRoot.querySelector('.fishing-settings')!.remove();

  const { pages: chat, show: showChat } = groups(
    get('river-panel-chat'),
    'chat',
    [
      ['talk', '说说话'],
      ['memory', '共同回忆'],
    ],
  );
  chat.talk!.append(
    get('river-panel-chat').querySelector('.desktop-chat-hint')!,
  );
  const catCard = document.querySelector<HTMLElement>('.cat-card')!;
  const catHome = document.createComment('desktop companion');
  catCard.before(catHome);
  chat.memory!.append(document.querySelector<HTMLElement>('.journal')!);
  const replyPages = document.createElement('div');
  replyPages.className = 'reply-pages';
  replyPages.innerHTML =
    '<button id="chat-reply-prev" aria-label="上一页对白">←</button><span id="chat-reply-page"></span><button id="chat-reply-next" aria-label="下一页对白">→</button>';
  get('dialogue').after(replyPages);
  let reply = '';
  let replyPage = 0;
  const navigation = mountSceneNavigation(place, toggled);
  const refresh = () => {
    const world = session.getSnapshot();
    navigation.refresh();
    get('river-coins').textContent = `● ${world.coins}`;
    if (mobile.matches) {
      if (catCard.parentElement !== chat.talk) chat.talk!.append(catCard);
    } else if (catCard.previousSibling !== catHome) catHome.after(catCard);
    const cat = world.cats.find((cat) => cat.id === session.selectedEntity);
    const fullReply =
      cat?.memories.at(-1)?.reply ??
      '喵……你来了。想聊聊，还是一起去河边待一会？';
    if (fullReply !== reply) {
      reply = fullReply;
      replyPage = 0;
    }
    const letters = Array.from(reply);
    const pages = Math.max(1, Math.ceil(letters.length / 100));
    replyPage = Math.min(replyPage, pages - 1);
    get('dialogue').textContent = letters
      .slice(replyPage * 100, (replyPage + 1) * 100)
      .join('');
    replyPages.hidden = pages === 1;
    get('chat-reply-page').textContent = `${replyPage + 1} / ${pages}`;
    (get('chat-reply-prev') as HTMLButtonElement).disabled = replyPage === 0;
    (get('chat-reply-next') as HTMLButtonElement).disabled =
      replyPage === pages - 1;
  };
  get('chat-reply-prev').addEventListener('click', () => {
    replyPage--;
    refresh();
  });
  get('chat-reply-next').addEventListener('click', () => {
    replyPage++;
    refresh();
  });
  mobile.addEventListener('change', refresh);
  refresh();
  return {
    ...navigation,
    refresh,
    /** Open the chat panel on its conversation page in the current scene. */
    openTalk() {
      navigation.open('chat');
      showChat('talk');
    },
  };
}
