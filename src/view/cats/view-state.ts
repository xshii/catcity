/** The parts of a cat's detail that open and close, in order (ui-design 5.2). */
export const CATS_SECTIONS = ['now', 'likes', 'family'] as const;
export type CatsSection = (typeof CATS_SECTIONS)[number];

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
  /** The cat whose detail takes the roster's place; null shows the roster. */
  detail: string | null;
  /** The detail's open sections; "now" at first. */
  open: readonly CatsSection[];
}

type CatsViewEvent =
  /** A chat with a cat went through; `note` names the level it reached, or is ''. */
  | { type: 'chatted'; catId: string; note: string }
  | { type: 'detail'; catId: string | null }
  /** Opens a closed section, closes an open one. */
  | { type: 'section'; section: CatsSection };

function reduceCatsView(view: CatsView, event: CatsViewEvent): CatsView {
  switch (event.type) {
    case 'chatted':
      return view.news.catId === event.catId && view.news.note === event.note
        ? view
        : { ...view, news: { catId: event.catId, note: event.note } };
    case 'detail':
      return view.detail === event.catId
        ? view
        : { ...view, detail: event.catId };
    case 'section':
      return {
        ...view,
        open: view.open.includes(event.section)
          ? view.open.filter((section) => section !== event.section)
          : [...view.open, event.section],
      };
  }
}

/** A tiny store: dispatch events, read the state, subscribe to changes. */
export function createCatsView() {
  let state: CatsView = {
    news: { catId: '', note: '' },
    detail: null,
    open: ['now'],
  };
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
export type CatsViewStore = ReturnType<typeof createCatsView>;
