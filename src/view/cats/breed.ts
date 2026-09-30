import './breed.css';
import type { GameSession } from '../../application';
import type { Confirm } from '../common/confirm';
import { ERROR_MESSAGES } from '../common/errors';
import { showBirthCard } from './birth';
import { birthCard, breedScreen, kittenFlow } from './breed-screen';
import { mountNameDialog } from './name-dialog';

const item = (line: string) => {
  const element = document.createElement('li');
  element.textContent = line;
  return element;
};

type Model = NonNullable<ReturnType<typeof breedScreen>>;
type Partner = Model['partners'][number];

/**
 * "Who could it have a kitten with", under the cats roster for the selected cat (spec 041
 * T-21, ui-design 5.4): a button that shows or hides the list `breedScreen` decides, a
 * row per other cat made once and kept (design 10.2). A partner who misses nothing has a
 * way to a kitten (T-22): the confirmation, then the name box, and only a name and a sex
 * send BREED_CATS; the card of the birth follows, and closing it selects the kitten.
 */
export function mountBreeding(deps: {
  session: GameSession;
  /** The cats panel's roster page: the list sits at its end. */
  roster: HTMLElement;
  /** Asks before the kitten (ui-design 4.2). */
  confirm: Confirm;
  /** Where the name box and the card of the birth float, over the panels. */
  layer: HTMLElement;
  notify: (text: string) => void;
}) {
  const { session } = deps;
  const section = document.createElement('section');
  section.className = 'breed';
  section.innerHTML =
    '<button id="breed-open" type="button" class="quiet" aria-expanded="false" aria-controls="breed-list"></button>' +
    '<div id="breed-list" class="breed-list" hidden><ul id="breed-partners" class="breed-partners"></ul><p id="breed-alone" class="breed-alone"></p>' +
    '<div id="breed-self" class="breed-group"><strong></strong><ul></ul></div>' +
    '<div id="breed-city" class="breed-group"><strong></strong><ul></ul></div></div>';
  deps.roster.append(section);
  const $ = (id: string) => section.querySelector<HTMLElement>(`#${id}`)!;
  const toggle = $('breed-open');
  const list = $('breed-partners');
  let open = false;
  // The words each part last showed: it is rebuilt only when they change (design 10.2).
  const shown = new Map<string, string>();
  const changed = (key: string, value: unknown) => {
    const words = JSON.stringify(value);
    if (shown.get(key) === words) return false;
    shown.set(key, words);
    return true;
  };
  const group = (id: string, { heading, lines }: Model['self']) => {
    if (!changed(id, { heading, lines })) return;
    const box = $(id);
    box.hidden = !lines.length;
    box.querySelector('strong')!.textContent = heading;
    box.querySelector('ul')!.replaceChildren(...lines.map(item));
  };

  const rows = new Map<string, ReturnType<typeof createRow>>();
  function createRow(partnerId: string) {
    const row = document.createElement('li');
    row.dataset.partnerId = partnerId;
    const name = document.createElement('strong');
    const sex = document.createElement('span');
    sex.className = 'breed-sex';
    sex.setAttribute('role', 'img');
    const lines = document.createElement('ul');
    const kitten = document.createElement('button');
    kitten.type = 'button';
    kitten.className = 'breed-kitten';
    kitten.dataset.breedWith = partnerId;
    kitten.addEventListener('click', () => ask(partnerId, kitten));
    row.append(name, sex, lines, kitten);
    return {
      row,
      update(partner: Partner, button: string) {
        row.dataset.ok = String(partner.ok);
        name.textContent = partner.name;
        sex.textContent = partner.sex.mark;
        sex.setAttribute('aria-label', partner.sex.label);
        if (changed(`lines ${partnerId}`, partner.lines))
          lines.replaceChildren(...partner.lines.map(item));
        kitten.hidden = !partner.ok;
        kitten.textContent = button;
        kitten.setAttribute('aria-label', partner.kitten);
      },
    };
  }

  const render = () => {
    const model = breedScreen(session.getSnapshot(), session.selectedEntity);
    section.hidden = !model;
    toggle.setAttribute('aria-expanded', String(open));
    $('breed-list').hidden = !open;
    if (!model) return;
    toggle.textContent = model.open;
    let next = list.firstElementChild;
    for (const partner of model.partners) {
      let row = rows.get(partner.id);
      if (!row) {
        row = createRow(partner.id);
        rows.set(partner.id, row);
      }
      row.update(partner, model.kitten);
      if (row.row !== next) list.insertBefore(row.row, next);
      next = row.row.nextElementSibling;
    }
    for (const [id, row] of rows) {
      if (model.partners.some((partner) => partner.id === id)) continue;
      row.row.remove();
      rows.delete(id);
      shown.delete(`lines ${id}`);
    }
    $('breed-alone').textContent = model.alone;
    $('breed-alone').hidden = !model.alone;
    group('breed-self', model.self);
    group('breed-city', model.city);
  };

  /** The confirmation, then the name box; nothing is sent until a name is given. */
  function ask(partnerId: string, opener: HTMLElement) {
    const selfId = session.selectedEntity;
    if (!selfId) return;
    const flow = kittenFlow(session.getSnapshot(), selfId, partnerId);
    deps.confirm.ask(flow.confirm, opener, () =>
      mountNameDialog({
        layer: deps.layer,
        world: session.getSnapshot(),
        input: flow.name,
        done: (name, sex) => {
          if (name === null || sex === null) return;
          const result = session.execute(flow.command(name, sex));
          if (!result.ok) return deps.notify(ERROR_MESSAGES[result.error]);
          const born = result.events.find((event) => event.type === 'CatBorn');
          const kittenId = born!.entityId;
          showBirthCard({
            layer: deps.layer,
            card: birthCard(session.getSnapshot(), kittenId),
            done: () => {
              session.select(kittenId);
              deps.roster
                .querySelector<HTMLElement>(`[data-cat-id="${kittenId}"]`)
                ?.focus({ preventScroll: true });
            },
          });
        },
      }),
    );
  }

  toggle.addEventListener('click', () => {
    open = !open;
    render();
  });
  session.subscribe(render);
  render();
}
