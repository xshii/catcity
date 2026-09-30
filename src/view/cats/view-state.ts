/**
 * What the cats panel shows besides the world and the selection (spec 015, 041 T-12).
 * View-local: never part of the world or a save.
 */
export interface CatsView {
  /**
   * The level the last chat reached, for the cat it was with: the detail keeps it after
   * the notice fades, until the next chat. '' when that chat reached none.
   */
  news: { catId: string; note: string };
}

type CatsViewEvent =
  /** A chat with a cat went through; `note` names the level it reached, or is ''. */
  { type: 'chatted'; catId: string; note: string };

function reduceCatsView(view: CatsView, event: CatsViewEvent): CatsView {
  switch (event.type) {
    case 'chatted':
      return view.news.catId === event.catId && view.news.note === event.note
        ? view
        : { ...view, news: { catId: event.catId, note: event.note } };
  }
}

/** A tiny store: dispatch events, read the state, subscribe to changes. */
export function createCatsView() {
  let state: CatsView = { news: { catId: '', note: '' } };
  const listeners = new Set<(view: CatsView) => void>();
  return {
    get: () => state,
    dispatch(event: CatsViewEvent) {
      const next = reduceCatsView(state, event);
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener(state);
    },
    subscribe(listener: (view: CatsView) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
