import './petting.css';
import type { GameSession } from '../../application';
import { PETTING, PET_SPOTS, type PetSpot } from '../../content/petting';
import { pettingTastes, type GameCommand } from '../../core';
import { catPose } from '../art/cat-look';
import { PET_SPOT_POINTS, pettingCat } from '../art/cat-petting';
import { outcomeNote } from '../shell/bond';
import { ERROR_MESSAGES } from '../shell/errors';
import type { Tools } from '../shell/place';
import { reduceStroke, type StrokeGesture } from './gesture';
import { PETTING_COPY, pettingEntry, pettingScreen } from './screen';
import { createPettingView, pettingPhase } from './view-state';

/** A dry run of the least round: would Core let this cat be petted now? */
const probe = (catId: string): GameCommand => ({
  type: 'PET_CAT',
  catId,
  strokes: [{ tick: 0, spot: PET_SPOTS[0] }],
});

/**
 * The petting minigame's screen and its way in from the cats panel (spec 039). The view
 * runs the pure round for what the player sees and sends its strokes when it ends; Core
 * replays them and decides the mood. Nothing here changes the world by itself.
 */
export function mountPetting(deps: {
  session: GameSession;
  notify: (text: string) => void;
  tools: Tools;
  /** The cats panel's roster page: the way in sits under the roster. */
  roster: HTMLElement;
  /** Where the screen floats, over the scene and its bars. */
  layer: HTMLElement;
}) {
  const { session } = deps;
  const view = createPettingView();

  const entry = document.createElement('div');
  entry.className = 'petting-entry';
  entry.innerHTML =
    '<button id="pet-cat" type="button" class="primary"></button><small id="pet-cat-note"></small><small id="pet-cat-known" class="petting-known"></small>';
  deps.roster.append(entry);

  const screen = document.createElement('section');
  screen.id = 'petting';
  screen.className = 'petting';
  screen.hidden = true;
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-modal', 'true');
  screen.setAttribute('aria-labelledby', 'petting-title');
  screen.innerHTML =
    `<div class="petting-heading"><h2 id="petting-title"></h2><span id="petting-time" class="petting-time"></span><button id="petting-close" type="button" aria-label="${PETTING_COPY.close}">✕</button></div>` +
    `<div class="petting-meter-row"><span aria-hidden="true">${PETTING_COPY.meter}</span><div id="petting-meter" class="petting-meter" role="meter" aria-valuemin="0" aria-valuemax="${PETTING.meter.max}"><span id="petting-meter-fill"></span></div></div>` +
    `<div id="petting-cat" class="petting-cat"><span class="petting-halo" aria-hidden="true"></span><span id="petting-purr" class="petting-purr" aria-hidden="true">${PETTING_COPY.purr}</span><div id="petting-art" class="petting-art"></div>` +
    PET_SPOTS.map(
      (spot) =>
        `<button type="button" class="petting-spot" data-spot="${spot}" style="left:${PET_SPOT_POINTS[spot].x}%;top:${PET_SPOT_POINTS[spot].y}%"><span class="petting-spot-name"></span><span class="petting-spot-mark" aria-hidden="true"></span></button>`,
    ).join('') +
    '<span id="petting-bubble" class="petting-bubble" hidden></span></div>' +
    '<p id="petting-hint" class="petting-hint" aria-live="polite"></p>' +
    `<p class="petting-keys">${PETTING_COPY.keys}</p>` +
    `<div id="petting-result" class="petting-result" hidden><p id="petting-line" class="petting-line"></p><strong id="petting-change"></strong><small id="petting-notes"></small><div class="petting-actions"><button id="petting-again" type="button" class="primary">${PETTING_COPY.again}</button><button id="petting-done" type="button">${PETTING_COPY.done}</button></div></div>`;
  deps.layer.append(screen);
  const $ = <T extends HTMLElement = HTMLElement>(
    id: string,
    root: HTMLElement = screen,
  ) => root.querySelector<T>(`#${id}`)!;
  const enter = $<HTMLButtonElement>('pet-cat', entry);
  const catBox = $('petting-cat');
  const spots = new Map(
    PET_SPOTS.map((spot) => [
      spot,
      screen.querySelector<HTMLButtonElement>(`[data-spot="${spot}"]`)!,
    ]),
  );
  const selectedCat = () =>
    session
      .getSnapshot()
      .cats.find((cat) => cat.id === session.selectedEntity) ?? null;
  const petted = () =>
    session.getSnapshot().cats.find((cat) => cat.id === view.get().catId) ??
    null;

  /** The way in; asked of Core when the world or the selection changes, not every tick. */
  const renderEntry = () => {
    const world = session.getSnapshot();
    const selected = selectedCat();
    entry.hidden = !selected;
    if (selected) {
      const model = pettingEntry(
        selected,
        pettingTastes(world.seed, selected.id),
        session.check(probe(selected.id)),
      );
      enter.textContent = model.label;
      enter.disabled = model.disabled;
      $('pet-cat-note', entry).textContent = model.note;
      $('pet-cat-known', entry).textContent = model.known;
      $('pet-cat-known', entry).hidden = !model.known;
    }
  };
  let art = '';
  const render = () => {
    const world = session.getSnapshot();
    const cat = petted();
    const model = pettingScreen(
      view.get(),
      cat,
      cat ? catPose(world, cat) : { face: 'calm', ears: 'up', curled: false },
    );
    screen.hidden = !model.open;
    if (!model.open || !cat) return;
    $('petting-title').textContent = model.title;
    $('petting-time').textContent =
      model.phase === 'playing' ? `${model.secondsLeft} 秒` : '';
    const meter = $('petting-meter');
    meter.setAttribute('aria-valuenow', String(model.meter.value));
    meter.setAttribute('aria-label', model.meter.label);
    $('petting-meter-fill').style.width = `${model.meter.value}%`;
    catBox.dataset.purr = String(model.purr);
    catBox.dataset.away = String(model.away);
    const nextArt = pettingCat(cat.appearance.coat, model.pose);
    if (nextArt !== art) {
      art = nextArt;
      $('petting-art').innerHTML = art;
    }
    for (const spot of model.spots) {
      const button = spots.get(spot.spot)!;
      button.disabled = spot.disabled;
      button.setAttribute('aria-label', spot.label);
      button.dataset.touched = String(spot.touched);
      button.dataset.known = String(!!spot.mark);
      button.querySelector('.petting-spot-name')!.textContent = spot.name;
      button.querySelector('.petting-spot-mark')!.textContent = spot.mark;
    }
    const bubble = $('petting-bubble');
    bubble.hidden = !model.bubble;
    if (model.bubble) {
      bubble.textContent = model.bubble.text;
      bubble.style.left = `${PET_SPOT_POINTS[model.bubble.spot].x}%`;
      bubble.style.top = `${PET_SPOT_POINTS[model.bubble.spot].y}%`;
    }
    $('petting-hint').textContent = model.hint;
    $('petting-hint').hidden = !model.hint;
    screen.querySelector<HTMLElement>('.petting-keys')!.hidden =
      model.phase !== 'playing';
    $('petting-result').hidden = !model.result;
    if (model.result) {
      $('petting-line').textContent = model.result.line;
      $('petting-change').textContent = model.result.change;
      $('petting-change').hidden = !model.result.change;
      $('petting-notes').textContent = model.result.notes.join(' · ');
      $('petting-notes').hidden = !model.result.notes.length;
    }
  };

  /** The round ran out: its strokes go to Core, which alone decides what it was worth. */
  const settle = () => {
    const { catId, strokes } = view.get();
    if (!catId) return;
    if (!strokes.length) {
      view.dispatch({ type: 'settled', result: 'none' });
      return;
    }
    const before = session.getSnapshot();
    const result = session.execute({ type: 'PET_CAT', catId, strokes });
    const petted = result.ok
      ? result.events.find((event) => event.type === 'CatPetted')
      : undefined;
    if (!result.ok || !petted) {
      view.dispatch({ type: 'close' });
      deps.notify(ERROR_MESSAGES[result.ok ? 'INVALID_COMMAND' : result.error]);
      return;
    }
    view.dispatch({
      type: 'settled',
      result: {
        spot: petted.spot,
        meter: petted.meter,
        mood: petted.mood,
        full: petted.full,
        note: outcomeNote(before, session.getSnapshot(), catId),
      },
    });
  };

  const open = () => {
    const cat = selectedCat();
    if (!cat || !session.check(probe(cat.id)).ok) return;
    deps.tools.close();
    view.dispatch({
      type: 'open',
      catId: cat.id,
      tastes: pettingTastes(session.getSnapshot().seed, cat.id),
    });
    spots.get(view.get().focus)!.focus({ preventScroll: true });
  };
  const close = () => {
    view.dispatch({ type: 'close' });
    enter.focus({ preventScroll: true });
  };
  enter.addEventListener('click', open);
  $('petting-close').addEventListener('click', close);
  $('petting-done').addEventListener('click', close);
  $('petting-again').addEventListener('click', open);

  const stroke = (spot: PetSpot | null) => {
    if (spot) view.dispatch({ type: 'stroke', spot });
  };
  const spotOf = (target: EventTarget | null) =>
    ((target instanceof Element &&
      target.closest<HTMLElement>('[data-spot]')?.dataset.spot) ||
      null) as PetSpot | null;
  /** The spot under a point of the screen; a dragging finger keeps its first target. */
  const spotAt = (x: number, y: number) => {
    for (const [spot, button] of spots) {
      const box = button.getBoundingClientRect();
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)
        return spot;
    }
    return null;
  };
  let gesture: StrokeGesture = null;
  const touch = (type: 'down' | 'move', event: PointerEvent) => {
    const next = reduceStroke(gesture, {
      type,
      point: { x: event.clientX, y: event.clientY },
      spot:
        type === 'down'
          ? spotOf(event.target)
          : spotAt(event.clientX, event.clientY),
    });
    gesture = next.gesture;
    stroke(next.stroke);
  };
  catBox.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    touch('down', event);
  });
  catBox.addEventListener('pointermove', (event) => touch('move', event));
  for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const)
    catBox.addEventListener(type, () => {
      gesture = reduceStroke(gesture, { type: 'up' }).gesture;
    });
  // The long press of a stroking finger must not open a menu or select text.
  catBox.addEventListener('contextmenu', (event) => event.preventDefault());
  for (const [spot, button] of spots) {
    // Keyboard and assistive activation; a pointer's stroke was taken when it went down.
    button.addEventListener('click', (event) => {
      if (event.detail === 0) stroke(spot);
    });
    button.addEventListener('focus', () =>
      view.dispatch({ type: 'focus', spot }),
    );
  }
  screen.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab') {
      // The screen is modal: Tab stays on its controls, round from the last to the first.
      const stops = Array.from(screen.querySelectorAll('button')).filter(
        (button) => !button.disabled && !button.closest('[hidden]'),
      );
      const at = stops.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault();
      stops[
        at === -1
          ? 0
          : (at + (event.shiftKey ? -1 : 1) + stops.length) % stops.length
      ]!.focus({ preventScroll: true });
      return;
    }
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowDown'
    )
      return;
    event.preventDefault();
    view.dispatch({ type: 'arrow', key: event.key });
    spots.get(view.get().focus)!.focus({ preventScroll: true });
  });
  document.addEventListener('visibilitychange', () =>
    view.dispatch({ type: 'page', hidden: document.hidden }),
  );
  window.setInterval(
    () => view.dispatch({ type: 'tick' }),
    1000 / PETTING.ticksPerSecond,
  );

  let phase = pettingPhase(view.get());
  view.subscribe((state) => {
    const before = phase;
    phase = pettingPhase(state);
    if (phase === 'settling') {
      settle();
      return;
    }
    render();
    // The spots rest once a round is settled: the keyboard goes on from the result.
    if (phase === 'result' && before !== 'result')
      $('petting-again').focus({ preventScroll: true });
  });
  session.subscribe(() => {
    // A cat that is gone (a reset, a loaded fixture) ends its round.
    if (view.get().catId && !petted()) view.dispatch({ type: 'close' });
    renderEntry();
    render();
  });
  renderEntry();
  render();
}
