import {
  reduceFishingView,
  type FishingView,
  type FishingViewEvent,
} from '../../src/view/fishing/view-state';

/** The fishing view state after these events, through the pure reducer. */
export const replay = (state: FishingView, ...events: FishingViewEvent[]) =>
  events.reduce(reduceFishingView, state);
