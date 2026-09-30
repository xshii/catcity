import './invite.css';
import type { GameSession } from '../../application';
import { INVITABLE_CATS, type CatDefinitionId } from '../../content/cats';
import { catPortrait } from '../art/illustrations';
import type { CatPose } from '../art/cat-look';
import { ERROR_MESSAGES } from '../common/errors';
import {
  arrivedNotice,
  INVITE_COPY,
  inviteCard,
  inviteEntry,
  inviteScreen,
} from './invite-screen';

/** A newcomer is drawn calm and awake: how it arrives. */
const NEWCOMER: CatPose = { face: 'calm', ears: 'up', curled: false };
/** The paw icon (ui-design 2.3): one big pad and four toes, 2px line. */
const PAW =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 13c-3 0-5.5 2.6-5.5 5 0 1.4 1.2 2 2.5 2 1.1 0 1.9-.5 3-.5s1.9.5 3 .5c1.3 0 2.5-.6 2.5-2 0-2.4-2.5-5-5.5-5z"/><circle cx="5" cy="10" r="1.8"/><circle cx="9" cy="5.5" r="1.8"/><circle cx="15" cy="5.5" r="1.8"/><circle cx="19" cy="10" r="1.8"/></svg>';

/**
 * The way in to inviting a new companion, under the roster, and the list it opens in the
 * roster's place (ui-design 5.3). Cards are made once per cat on the list; renders only
 * change their price, button and reason. Nothing here changes the world by itself.
 */
export function mountInvite(deps: {
  session: GameSession;
  notify: (text: string) => void;
  /** The cats panel's roster page: the way in sits at its end, the list replaces it. */
  roster: HTMLElement;
}) {
  const { session, roster } = deps;
  const open = document.createElement('button');
  open.id = 'invite-open';
  open.type = 'button';
  open.className = 'invite-open';
  open.innerHTML = `${PAW}<span></span>`;
  const list = document.createElement('section');
  list.id = 'cat-invite';
  list.className = 'cat-invite';
  list.hidden = true;
  list.setAttribute('aria-labelledby', 'invite-title');
  list.innerHTML =
    `<div class="invite-heading"><button id="invite-back" type="button" aria-label="${INVITE_COPY.backLabel}">${INVITE_COPY.back}</button><h3 id="invite-title">${INVITE_COPY.title}</h3></div>` +
    '<p id="invite-beds" class="invite-beds"></p>' +
    `<p id="invite-all-here" class="invite-beds" hidden>${INVITE_COPY.allHere}</p>` +
    '<ul id="invite-list" class="invite-list"></ul>';
  roster.append(open, list);
  const $ = (id: string) => list.querySelector<HTMLElement>(`#${id}`)!;
  const back = $('invite-back') as HTMLButtonElement;

  const cards = new Map(
    INVITABLE_CATS.map((id) => {
      const card = inviteCard(id);
      const item = document.createElement('li');
      item.className = 'invite-card';
      item.dataset.invite = id;
      item.innerHTML =
        `<span class="invite-portrait">${catPortrait(card.look, NEWCOMER)}</span>` +
        '<div class="invite-about"><p class="invite-name"><strong></strong><span class="invite-sex" role="img"></span><span class="invite-breed"></span></p><p class="invite-personality"></p><p class="invite-likes"></p><p class="invite-hint"></p></div>' +
        `<button type="button" class="invite-button" data-invite-cat="${id}"></button><small class="invite-reason"></small>`;
      const part = (selector: string) =>
        item.querySelector<HTMLElement>(selector)!;
      part('strong').textContent = card.name;
      part('.invite-sex').textContent = card.sex.symbol;
      part('.invite-sex').setAttribute('aria-label', card.sex.word);
      part('.invite-breed').textContent = card.breed;
      part('.invite-personality').textContent = card.personality;
      part('.invite-likes').textContent = card.likes;
      part('.invite-hint').textContent = card.hint;
      const button = part('.invite-button') as HTMLButtonElement;
      button.addEventListener('click', () => invite(id));
      $('invite-list').append(item);
      return [id, { item, button, reason: part('.invite-reason') }] as const;
    }),
  );

  let shown = false;
  const render = () => {
    const world = session.getSnapshot();
    open.querySelector('span')!.textContent = inviteEntry(world);
    list.hidden = !shown;
    roster.dataset.view = shown ? 'invite' : 'roster';
    // Dry runs only while the list is on screen, not on every clock tick behind it.
    if (!shown) return;
    const model = inviteScreen(world, (command) => session.check(command));
    $('invite-beds').textContent = model.beds;
    $('invite-beds').hidden = model.allHere;
    $('invite-all-here').hidden = !model.allHere;
    for (const [id, card] of cards) {
      const cat = model.cats.find((item) => item.id === id);
      card.item.hidden = !cat;
      if (!cat) continue;
      card.button.textContent = cat.button;
      card.button.disabled = cat.disabled;
      card.reason.textContent = cat.reason ?? '';
      card.reason.hidden = !cat.reason;
    }
  };
  const show = (next: boolean) => {
    shown = next;
    render();
    (next ? back : open).focus({ preventScroll: true });
  };
  function invite(id: CatDefinitionId) {
    const result = session.execute({ type: 'INVITE_CAT', definitionId: id });
    if (!result.ok) {
      deps.notify(ERROR_MESSAGES[result.error]);
      return;
    }
    const arrived = result.events.find((event) => event.type === 'CatInvited');
    deps.notify(arrivedNotice(session.getSnapshot(), arrived!.entityId));
    show(false);
  }
  open.addEventListener('click', () => show(true));
  back.addEventListener('click', () => show(false));
  session.subscribe(render);
  render();
}
