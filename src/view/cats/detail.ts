import './cats.css';
import type { GameSession } from '../../application';
import { STARTER_CAT_ID } from '../../content/cats';
import type { Confirm } from '../common/confirm';
import type { PlaceState } from '../common/place';
import { mountNeuter } from './neuter';
import { CATS_COPY, detailScreen, talkCard } from './screen';
import {
  CATS_SECTIONS,
  type CatsSection,
  type CatsViewStore,
} from './view-state';

type Model = NonNullable<ReturnType<typeof detailScreen>>;

/** One line of a section: a term, its words, an optional meter and a note under them. */
function createLine(list: HTMLElement) {
  const line = document.createElement('div');
  line.className = 'profile-line';
  const term = document.createElement('dt');
  const value = document.createElement('dd');
  const text = document.createElement('span');
  const meter = document.createElement('progress');
  const note = document.createElement('small');
  value.append(text, meter, note);
  line.append(term, value);
  list.append(line);
  return (shown: Model['sections'][number]['lines'][number]) => {
    term.textContent = shown.label;
    text.textContent = shown.text;
    meter.hidden = !shown.meter;
    if (shown.meter) {
      meter.max = shown.meter.max;
      meter.value = shown.meter.value;
      meter.setAttribute('aria-label', shown.label);
    }
    note.textContent = shown.note;
    note.hidden = !shown.note;
  };
}

/**
 * A cat's detail in the roster's place (ui-design 5.2): a heading, then the sections
 * "now", "likes" and "family", each opened and closed by its title. Its buttons and lines
 * are made once and kept (design 10.2).
 */
function mountProfile(page: HTMLElement, view: CatsViewStore) {
  const profile = document.createElement('section');
  profile.id = 'cat-profile';
  profile.className = 'cat-profile';
  profile.hidden = true;
  profile.setAttribute('aria-labelledby', 'profile-name');
  profile.innerHTML =
    `<button id="profile-back" type="button" aria-label="${CATS_COPY.backLabel}">${CATS_COPY.back}</button>` +
    '<div class="profile-heading"><span class="profile-portrait" aria-hidden="true"></span><div><h3 id="profile-name"><span></span><span class="roster-sex" role="img"></span></h3><p id="profile-about"></p></div></div>' +
    CATS_SECTIONS.map(
      (id) =>
        `<section class="profile-part"><h4><button id="profile-toggle-${id}" type="button" aria-controls="profile-${id}">${CATS_COPY.sections[id]}</button></h4><dl id="profile-${id}"></dl></section>`,
    ).join('');
  page.append(profile);
  const $ = (selector: string) => profile.querySelector<HTMLElement>(selector)!;
  const back = $('#profile-back');
  back.addEventListener('click', () =>
    view.dispatch({ type: 'detail', catId: null }),
  );
  for (const id of CATS_SECTIONS)
    $(`#profile-toggle-${id}`).addEventListener('click', () =>
      view.dispatch({ type: 'section', section: id }),
    );
  const lines = new Map<CatsSection, ReturnType<typeof createLine>[]>();
  let portrait = '';
  return {
    back,
    /** The family section, which neutering ends, and its title. */
    family: {
      section: $('#profile-family').parentElement!,
      title: $('#profile-toggle-family'),
    },
    apply(model: Model | null) {
      profile.hidden = !model;
      page.toggleAttribute('data-profile', !!model);
      if (!model) return;
      if (portrait !== model.portrait) {
        portrait = model.portrait;
        $('.profile-portrait').innerHTML = portrait;
      }
      $('#profile-name span').textContent = model.name;
      $('#profile-name [role=img]').textContent = model.sex.mark;
      $('#profile-name [role=img]').setAttribute('aria-label', model.sex.label);
      $('#profile-about').textContent = model.about;
      for (const section of model.sections) {
        const list = $(`#profile-${section.id}`);
        $(`#profile-toggle-${section.id}`).setAttribute(
          'aria-expanded',
          String(section.open),
        );
        list.hidden = !section.open;
        if (!lines.has(section.id))
          lines.set(
            section.id,
            section.lines.map(() => createLine(list)),
          );
        section.lines.forEach((line, index) =>
          lines.get(section.id)![index]!(line),
        );
      }
    },
  };
}

/**
 * The selected cat on the cats panel's pages (spec 041 T-12): its card above the chat,
 * and the detail that a roster row opens in the roster's place. `talkCard` and
 * `detailScreen` decide them. Nothing here changes the world except choosing the first cat
 * and, once confirmed, neutering (T-20).
 */
export function mountDetail(deps: {
  session: GameSession;
  place: PlaceState;
  view: CatsViewStore;
  /** Asks before neutering (ui-design 4.2). */
  confirm: Confirm;
  notify: (text: string) => void;
  /** The cat card of the page markup, above the chat. */
  card: HTMLElement;
  /** The cats panel's roster page: the detail takes its place. */
  page: HTMLElement;
}) {
  const { session, card, view } = deps;
  const profile = mountProfile(deps.page, view);
  mountNeuter({ ...deps, ...profile.family });
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    card.querySelector<T>(selector)!;
  const render = () => {
    const world = session.getSnapshot();
    profile.apply(
      detailScreen(
        world,
        view.get(),
        session.selectedEntity,
        deps.place.get() === 'river',
      ),
    );
    const model = talkCard(world, session.selectedEntity, view.get());
    $('#cat-detail').hidden = !model.known;
    $('#cat-description').hidden = model.known;
    $('#meet-cat').hidden = model.known;
    $('#cat-name').textContent = model.name;
    $('#mood').textContent = model.mood.text;
    $('#mood').setAttribute('aria-label', model.mood.label);
    $('#mood-hint').textContent = model.mood.hint;
    $('#mood-hint').hidden = !model.mood.hint;
    if (model.cat) {
      $('label[for=message]').textContent = model.cat.talk;
      $('.cat-avatar').classList.toggle('gray-cat', model.cat.gray);
      $('#traits').textContent = model.cat.traits;
      const bond = model.cat.bond;
      $('#bond-level').setAttribute('aria-label', bond.label);
      $('#bond-hearts').textContent = bond.hearts;
      $('#bond-name').textContent = bond.name;
      $<HTMLProgressElement>('#bond-progress').max = bond.progress.max;
      $<HTMLProgressElement>('#bond-progress').value = bond.progress.value;
      $('#bond-next').textContent = bond.next;
      $('#bond-news').textContent = model.cat.news;
      $('#bond-news').hidden = !model.cat.news;
    }
    $('#reunion').textContent = model.reunion;
    $('#bond').textContent = model.together;
  };
  $('#meet-cat').addEventListener('click', () =>
    session.select(STARTER_CAT_ID),
  );
  // Opening a detail puts the focus on its way back, once it is on screen.
  let opened = view.get().detail;
  view.subscribe((state) => {
    render();
    if (state.detail && state.detail !== opened) profile.back.focus();
    opened = state.detail;
  });
  session.subscribe(render);
  deps.place.subscribe(render);
  render();
}
