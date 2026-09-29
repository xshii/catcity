import { describe, expect, it } from 'vitest';
import { RandomService } from '../../src/core/random';
import { createWorld } from '../../src/core/world';
import {
  createCityView,
  initialCityView,
  reduceCityView,
  selectionGone,
  type CityView,
  type CityViewEvent,
} from '../../src/view/city/view-state';

const run = (state: CityView, ...events: CityViewEvent[]) =>
  events.reduce(reduceCityView, state);
const tile = (x: number, y: number): CityViewEvent => ({
  type: 'select',
  selection: { kind: 'tile', position: { x, y } },
});

describe('city view state', () => {
  it('starts in the city following the cat, with nothing selected', () => {
    expect(initialCityView()).toEqual({
      place: 'city',
      selection: null,
      moving: null,
      walker: null,
      overview: false,
    });
  });

  it('picks a cat as the walker, keeps it across tile cards, and lets it go on a second tap', () => {
    const picked = run(initialCityView(), { type: 'cat', catId: 'mochi' });
    expect(picked).toMatchObject({
      selection: { kind: 'cat', catId: 'mochi' },
      walker: 'mochi',
    });
    const onTile = run(picked, tile(4, 4));
    expect(onTile).toMatchObject({
      selection: { kind: 'tile' },
      walker: 'mochi',
    });
    expect(run(onTile, { type: 'cat', catId: 'mochi' })).toEqual(
      initialCityView(),
    );
    // Another cat takes over as the walker.
    expect(run(onTile, { type: 'cat', catId: 'pepper' }).walker).toBe('pepper');
  });

  it('moves a building only from a selected tile, and any new selection ends the move', () => {
    expect(
      run(initialCityView(), { type: 'move', buildingId: 'b' }).moving,
    ).toBeNull();
    const moving = run(initialCityView(), tile(4, 4), {
      type: 'move',
      buildingId: 'b',
    });
    expect(moving.moving).toBe('b');
    expect(run(moving, tile(3, 3)).moving).toBeNull();
    expect(run(moving, { type: 'clear' }).moving).toBeNull();
    expect(
      run(moving, {
        type: 'select',
        selection: { kind: 'water', position: { x: 7, y: 4 }, spotId: 'POND' },
      }).moving,
    ).toBeNull();
  });

  it('clears the map selection on the river and keeps the camera mode', () => {
    const busy = run(
      initialCityView(),
      { type: 'cat', catId: 'mochi' },
      tile(4, 4),
      { type: 'move', buildingId: 'b' },
      { type: 'overview' },
    );
    const river = run(busy, { type: 'place', place: 'river' });
    expect(river).toEqual({
      ...initialCityView(),
      place: 'river',
      overview: true,
    });
    // Nothing can be selected from the river.
    expect(run(river, tile(4, 4), { type: 'cat', catId: 'mochi' })).toBe(river);
    expect(run(river, { type: 'place', place: 'city' }).overview).toBe(true);
  });

  it('keeps its invariants under any sequence of events', () => {
    const rng = new RandomService(11);
    const pick = <T>(items: readonly T[]) => items[rng.nextInt(items.length)]!;
    const positions = [
      { x: 4, y: 4 },
      { x: 7, y: 4 },
    ];
    const event = (): CityViewEvent =>
      pick<CityViewEvent>([
        { type: 'place', place: pick(['city', 'river'] as const) },
        {
          type: 'select',
          selection: pick([
            { kind: 'tile', position: pick(positions) },
            { kind: 'cat', catId: pick(['mochi', 'pepper']) },
            { kind: 'water', position: { x: 7, y: 4 }, spotId: 'POND' },
          ] as const),
        },
        { type: 'cat', catId: pick(['mochi', 'pepper']) },
        { type: 'move', buildingId: pick(['a', 'b']) },
        { type: 'clear' },
        { type: 'overview' },
      ]);
    let state = initialCityView();
    for (let i = 0; i < 20_000; i++) {
      state = reduceCityView(state, event());
      if (state.place !== 'city')
        expect(state).toMatchObject({
          selection: null,
          moving: null,
          walker: null,
        });
      if (state.moving) expect(state.selection?.kind).toBe('tile');
      if (state.selection?.kind === 'cat')
        expect(state.walker).toBe(state.selection.catId);
    }
  });

  it('notices a selection the world no longer has', () => {
    const world = createWorld(42).getSnapshot();
    const view = (selection: CityView['selection']) => ({
      ...initialCityView(),
      selection,
    });
    expect(selectionGone(view(null), world)).toBe(false);
    expect(selectionGone(view({ kind: 'cat', catId: 'mochi' }), world)).toBe(
      false,
    );
    expect(selectionGone(view({ kind: 'cat', catId: 'ghost' }), world)).toBe(
      true,
    );
    expect(
      selectionGone(view({ kind: 'tile', position: { x: 4, y: 4 } }), world),
    ).toBe(false);
    expect(
      selectionGone(view({ kind: 'tile', position: { x: 40, y: 4 } }), world),
    ).toBe(true);
  });

  it('notifies subscribers once per change and not for no-ops', () => {
    const view = createCityView();
    const seen: CityView[] = [];
    view.subscribe((state) => seen.push(state));
    view.dispatch({ type: 'overview' });
    view.dispatch({ type: 'clear' });
    view.dispatch({ type: 'place', place: 'city' });
    expect(seen).toHaveLength(1);
    expect(view.get().overview).toBe(true);
  });
});
