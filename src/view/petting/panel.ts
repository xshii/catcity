import './petting.css';
import type { GameSession } from '../../application';
import { STARTER_CAT_ID } from '../../content/cats';
import { PETTING, PET_SPOTS, type PetSpot } from '../../content/petting';
import { pettingTastes, type GameCommand } from '../../core';
import { catPose, lookOf } from '../art/cat-look';
import {
  PETTING_ART,
  pettingCat,
  pettingRegions,
  spotAt,
} from '../art/cat-petting';
import { outcomeNote } from '../common/bond';
import { ERROR_MESSAGES } from '../common/errors';
import type { PlaceState, Tools } from '../common/place';
import type { SettingsSheet } from '../common/settings';
import { reduceStroke, type StrokeGesture } from './gesture';
import {
  PETTING_COPY,
  pettingBondLeft,
  pettingEntry,
  pettingScreen,
} from './screen';
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
  /** The screen is a minigame over the place: it holds the city clock at 1×. */
  place: PlaceState;
  notify: (text: string) => void;
  tools: Tools;
  /** The cats panel's roster page: the way in sits under the roster. */
  roster: HTMLElement;
  /** Where the screen floats, over the scene and its bars. */
  layer: HTMLElement;
  /**
   * The settings sheet of every page: its gear floats over this screen, among its
   * controls, and a round holds while the sheet is open.
   */
  settings: Pick<SettingsSheet, 'subscribe' | 'gear'>;
}) {
  const { session } = deps;
  const view = createPettingView();
  const gear = deps.settings.gear;

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
  // ui-design 5.5: nothing sits on the cat. The hint is above it and the reaction below,
  // each in its own place; the bar of spots is at the bottom, for keys and screen readers.
  screen.innerHTML =
    `<div class="petting-heading"><h2 id="petting-title"></h2><span id="petting-time" class="petting-time"></span><button id="petting-close" type="button" aria-label="${PETTING_COPY.close}">✕</button></div>` +
    '<div class="petting-stage">' +
    `<div id="petting-meter-row" class="petting-meter-row"><span aria-hidden="true">${PETTING_COPY.meter}</span><div id="petting-meter" class="petting-meter" role="meter" aria-valuemin="0" aria-valuemax="${PETTING.meter.max}"><span id="petting-meter-fill"></span></div></div>` +
    '<p id="petting-hint" class="petting-hint" aria-live="polite"></p>' +
    `<div id="petting-cat" class="petting-cat"><span class="petting-halo" aria-hidden="true"></span><div class="petting-body"><div id="petting-art" class="petting-art"></div><div id="petting-regions" class="petting-regions">${pettingRegions()}</div></div></div>` +
    '<p id="petting-bubble" class="petting-bubble" aria-live="polite"></p>' +
    `<div id="petting-bar" class="petting-bar" role="group" aria-label="${PETTING_COPY.bar}">` +
    PET_SPOTS.map(
      (spot) =>
        `<button type="button" class="petting-spot" data-spot="${spot}"><span class="petting-spot-name"></span><span class="petting-spot-mark" aria-hidden="true"></span></button>`,
    ).join('') +
    '</div>' +
    `<p class="petting-keys">${PETTING_COPY.keys}</p>` +
    `<div id="petting-result" class="petting-result" hidden><p id="petting-line" class="petting-line"></p><p class="petting-change-row"><strong id="petting-change"></strong><span id="petting-mood"></span></p><strong id="petting-bond"></strong><small id="petting-today"></small><small id="petting-notes"></small><div class="petting-actions"><button id="petting-again" type="button" class="primary">${PETTING_COPY.again}</button><button id="petting-done" type="button">${PETTING_COPY.done}</button></div></div>` +
    '</div>';
  deps.layer.append(screen);
  const $ = <T extends HTMLElement = HTMLElement>(
    id: string,
    root: HTMLElement = screen,
  ) => root.querySelector<T>(`#${id}`)!;
  const enter = $<HTMLButtonElement>('pet-cat', entry);
  const catBox = $('petting-cat');
  const regionBox = $('petting-regions');
  const regions = new Map(
    PET_SPOTS.map((spot) => [
      spot,
      regionBox.querySelector<SVGElement>(`[data-region="${spot}"]`)!,
    ]),
  );
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
      world.cats.find((item) => item.id === STARTER_CAT_ID)?.name ?? '',
    );
    screen.hidden = !model.open;
    // A modal dialog: the gear floating over it is one of its own while it is open.
    if (model.open) screen.setAttribute('aria-owns', gear.id);
    else screen.removeAttribute('aria-owns');
    if (!model.open || !cat) return;
    screen.dataset.phase = model.phase;
    screen.dataset.away = String(model.away);
    const result = model.phase === 'result';
    $('petting-meter-row').hidden = result;
    $('petting-bar').hidden = result;
    $('petting-title').textContent = model.title;
    $('petting-time').textContent =
      model.phase === 'playing' ? `${model.secondsLeft} 秒` : '';
    const meter = $('petting-meter');
    meter.setAttribute('aria-valuenow', String(model.meter.value));
    meter.setAttribute('aria-label', model.meter.label);
    $('petting-meter-fill').style.width = `${model.meter.value}%`;
    catBox.dataset.purr = String(model.purr);
    catBox.dataset.away = String(model.away);
    const nextArt = pettingCat(lookOf(cat), model.pose);
    if (nextArt !== art) {
      art = nextArt;
      $('petting-art').innerHTML = art;
    }
    for (const spot of model.spots) {
      const button = spots.get(spot.spot)!;
      button.disabled = spot.disabled;
      button.setAttribute('aria-label', spot.label);
      button.dataset.touched = String(spot.touched);
      button.dataset.glow = spot.glow ?? '';
      button.dataset.known = String(spot.mark !== PETTING_COPY.unknownMark);
      button.querySelector('.petting-spot-name')!.textContent = spot.name;
      button.querySelector('.petting-spot-mark')!.textContent = spot.mark;
      regions.get(spot.spot)!.dataset.glow = spot.glow ?? '';
    }
    // The bubble keeps its place below the cat when empty, so nothing moves.
    const bubble = $('petting-bubble');
    bubble.hidden = result;
    bubble.textContent = model.bubble ?? '';
    $('petting-hint').textContent = model.hint;
    $('petting-hint').hidden = !model.hint;
    screen.querySelector<HTMLElement>('.petting-keys')!.hidden =
      model.phase !== 'playing';
    $('petting-result').hidden = !model.result;
    if (model.result) {
      $('petting-line').textContent = model.result.line;
      $('petting-change').textContent = model.result.change;
      $('petting-change').hidden = !model.result.change;
      $('petting-mood').textContent = model.result.mood;
      $('petting-bond').textContent = model.result.bond;
      $('petting-bond').hidden = !model.result.bond;
      $('petting-today').textContent = model.result.today;
      $('petting-today').hidden = !model.result.today;
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
    const bondBefore = petted()?.playerBond ?? 0;
    const result = session.execute({ type: 'PET_CAT', catId, strokes });
    const event = result.ok
      ? result.events.find((event) => event.type === 'CatPetted')
      : undefined;
    const cat = petted();
    if (!result.ok || !event || !cat) {
      view.dispatch({ type: 'close' });
      deps.notify(ERROR_MESSAGES[result.ok ? 'INVALID_COMMAND' : result.error]);
      return;
    }
    const after = session.getSnapshot();
    view.dispatch({
      type: 'settled',
      result: {
        spot: event.spot,
        meter: event.meter,
        mood: event.mood,
        full: event.full,
        note: outcomeNote(before, after, catId),
        moodAfter: cat.mood,
        bond: cat.playerBond - bondBefore,
        bondLeft: pettingBondLeft(cat, after.minute),
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
  /** The spot under a point of the screen, found in the drawing the regions share. */
  const spotUnder = (x: number, y: number) => {
    const box = regionBox.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    return spotAt({
      x: ((x - box.left) / box.width) * PETTING_ART.width,
      y: ((y - box.top) / box.height) * PETTING_ART.height,
    });
  };
  let gesture: StrokeGesture = null;
  const touch = (type: 'down' | 'move', event: PointerEvent) => {
    const next = reduceStroke(gesture, {
      type,
      point: { x: event.clientX, y: event.clientY },
      spot: spotUnder(event.clientX, event.clientY),
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
    // A cell of the bar is a stroke on its spot, by tap, key or screen reader.
    button.addEventListener('click', () => stroke(spot));
    button.addEventListener('focus', () =>
      view.dispatch({ type: 'focus', spot }),
    );
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab') {
      // The screen is modal: Tab stays on its controls, round from the last to the first.
      // The settings gear floats over its heading, so it comes after the close button.
      const stops = Array.from(screen.querySelectorAll('button')).filter(
        (button) => !button.disabled && !button.closest('[hidden]'),
      );
      stops.splice(stops.indexOf($('petting-close')) + 1, 0, gear);
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
  };
  screen.addEventListener('keydown', onKey);
  // The gear is outside the screen's markup: its Escape and Tab are the screen's too.
  gear.addEventListener('keydown', (event) => {
    if (
      pettingPhase(view.get()) !== 'closed' &&
      (event.key === 'Escape' || event.key === 'Tab')
    )
      onKey(event);
  });
  deps.settings.subscribe((open) => view.dispatch({ type: 'settings', open }));
  document.addEventListener('visibilitychange', () =>
    view.dispatch({ type: 'page', hidden: document.hidden }),
  );
  // The round follows real time, not the number of timer calls: a busy phone delays
  // timers, and twelve seconds must stay twelve seconds. A long stall is not made up.
  const TICK_MS = 1000 / PETTING.ticksPerSecond;
  let clock = performance.now();
  let manualClock = false;
  window.setInterval(() => {
    const ticks = Math.floor((performance.now() - clock) / TICK_MS);
    if (ticks < 1) return;
    clock += ticks * TICK_MS;
    if (manualClock) return;
    view.dispatch({
      type: 'tick',
      ticks: Math.min(ticks, PETTING.ticksPerSecond),
    });
  }, TICK_MS);

  let phase = pettingPhase(view.get());
  view.subscribe((state) => {
    const before = phase;
    phase = pettingPhase(state);
    deps.place.setPetting(phase !== 'closed');
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
  return {
    /** Browser time drives the round; tests may take over the clock, as for fishing. */
    clock: {
      setManual: (manual: boolean) => {
        manualClock = manual;
      },
      /** Steps a round that is going; returns how many ticks applied. */
      step: (ticks: number) => {
        const round = view.get().round;
        if (pettingPhase(view.get()) !== 'playing' || !round) return 0;
        view.dispatch({ type: 'tick', ticks });
        return (view.get().round?.tick ?? PETTING.roundTicks) - round.tick;
      },
    },
  };
}
