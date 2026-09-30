import './breed.css';
import type { GameSession } from '../../application';
import { breedScreen } from './breed-screen';

const item = (line: string) => {
  const element = document.createElement('li');
  element.textContent = line;
  return element;
};

/**
 * "Who could it have a kitten with", under the cats roster for the selected cat (spec 041
 * T-21, ui-design 5.4): a button that shows or hides the list `breedScreen` decides. It
 * only reads the world; choosing a partner comes with the command (T-22).
 */
export function mountBreeding(deps: {
  session: GameSession;
  /** The cats panel's roster page: the list sits at its end. */
  roster: HTMLElement;
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
  let open = false;
  // The model's last words: the list is built again only when they change (design 10.2).
  let shown = '';
  const group = (id: string, { heading, lines }: Group) => {
    const box = $(id);
    box.hidden = !lines.length;
    box.querySelector('strong')!.textContent = heading;
    box.querySelector('ul')!.replaceChildren(...lines.map(item));
  };
  const render = () => {
    const model = breedScreen(session.getSnapshot(), session.selectedEntity);
    section.hidden = !model;
    toggle.setAttribute('aria-expanded', String(open));
    $('breed-list').hidden = !open;
    const words = JSON.stringify(model);
    if (!model || words === shown) return;
    shown = words;
    toggle.textContent = model.open;
    $('breed-partners').replaceChildren(
      ...model.partners.map((partner) => {
        const row = document.createElement('li');
        row.dataset.partnerId = partner.id;
        row.dataset.ok = String(partner.ok);
        const name = document.createElement('strong');
        name.textContent = partner.name;
        const sex = document.createElement('span');
        sex.className = 'breed-sex';
        sex.setAttribute('role', 'img');
        sex.setAttribute('aria-label', partner.sex.label);
        sex.textContent = partner.sex.mark;
        const lines = document.createElement('ul');
        lines.append(...partner.lines.map(item));
        row.append(name, sex, lines);
        return row;
      }),
    );
    $('breed-alone').textContent = model.alone;
    $('breed-alone').hidden = !model.alone;
    group('breed-self', model.self);
    group('breed-city', model.city);
  };
  toggle.addEventListener('click', () => {
    open = !open;
    render();
  });
  session.subscribe(render);
  render();
}

type Group = NonNullable<ReturnType<typeof breedScreen>>['self'];
