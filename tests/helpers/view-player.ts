import { expect } from 'vitest';
import { FISHING, type SpotId } from '../../src/content/fishing';
import { DEFAULT_TUNING } from '../../src/view/motion/rod';
import {
  $,
  click,
  key,
  orient,
  spin,
  text,
  visible,
  type Game,
} from './view-rig';

/**
 * Drives the view rig like a player, in the E2E adapter's words
 * (harness/adapters/catcity): the same controls, read the same way.
 */

const scene = () =>
  $('#visit-river').getAttribute('aria-pressed') === 'true' ? 'river' : 'city';

function expandTab(selector: string) {
  expect(visible(selector)).toBe(true);
  if ($(selector).getAttribute('aria-expanded') !== 'true') click(selector);
  expect($(selector).getAttribute('aria-expanded')).toBe('true');
}

export function closeRiverPanel() {
  if (visible('#river-tools-close')) click('#river-tools-close');
  expect(visible('#river-tools-close')).toBe(false);
}

/** Walks the selected cat to a shore; the outing page finds it without a map tap. */
function reachWaterway(spotId: SpotId) {
  closeRiverPanel();
  click('#visit-city');
  expandTab('#city-tab-outing');
  click(`[data-outing-spot="${spotId}"]`);
  if (
    visible('#walk-to-waterway') &&
    !$<HTMLButtonElement>('#walk-to-waterway').disabled
  )
    click('#walk-to-waterway');
  for (let tick = 0; tick < 40 && !visible('#begin-fishing'); tick++)
    click('#city-wait');
  expect(visible('#begin-fishing')).toBe(true);
}

export function enterRiver(game: Game) {
  if (scene() === 'river') return;
  if (!game.world().fishing.active)
    reachWaterway(
      ($<HTMLSelectElement>('#fish-location').value as SpotId) || 'POND',
    );
  click('#visit-river');
  expect(scene()).toBe('river');
}

export function openGear(
  game: Game,
  section: 'setup' | 'supplies' | 'info' = 'setup',
) {
  if (scene() !== 'river') {
    closeRiverPanel();
    enterRiver(game);
  }
  expandTab('#river-tab-gear');
  click(`#gear-tab-${section}`);
}

/** The cats panel of whichever scene shows, on one of its pages. */
export function openCats(section: 'roster' | 'talk' | 'memory' = 'roster') {
  expandTab(`#${scene()}-tab-cats`);
  click(`#cats-tab-${section}`);
}

/** Charge briefly with the keyboard and release: one real cast, which pays its stamina. */
export function castOnce(game: Game) {
  $('#fish-control').focus();
  key('keydown', 'Space');
  game.tick(10);
  key('keyup', 'Space');
  game.until(() => game.world().fishing.active?.phase !== 'charge', 4);
}

/** The button flow's meter, as the player reads it. */
export function meter() {
  const bar = $('#angling-bar');
  return {
    phase: bar.dataset.phase,
    value: Number(bar.getAttribute('aria-valuenow')),
    low: Number(bar.dataset.low),
    high: Number(bar.dataset.high),
  };
}

/** Hold and release the rod button against the visible meter until the fish is in. */
export function catchFish(game: Game) {
  expect(visible('#fish-control')).toBe(true);
  $('#fish-control').focus();
  let held = false;
  const hold = (next: boolean) => {
    if (held !== next) key(next ? 'keydown' : 'keyup', 'Space');
    held = next;
  };
  try {
    if (meter().phase === 'charge') {
      hold(true);
      game.until(() => meter().value >= 65, 80);
      hold(false);
    } else if (text('#fish-pause') === '继续钓鱼') click('#fish-pause');
    game.until(() => meter().phase === 'hook', 100);
    game.until(() => {
      const state = meter();
      return state.value >= state.low + 6 && state.value <= state.high - 6;
    }, 80);
    hold(true);
    game.until(() => meter().phase === 'fight', 30);
    // A fight lasts at most FISHING.fight.maxTicks (420) ticks.
    for (let n = 0; n < 420 && visible('#angling-live'); n++) {
      const state = meter();
      hold(state.value < (state.low + state.high) / 2);
      game.tick();
    }
    hold(false);
    expect(visible('#angling-live')).toBe(false);
    expect(text('#fish-result')).toContain('钓到了');
  } finally {
    hold(false);
  }
}

/** A device that finished the first-cast guide and calibrated before (spec 033 F3). */
export const SEASONED = {
  'cat-city.fishing-guide': 'done',
  'cat-city.rod-tuning.v2': JSON.stringify(DEFAULT_TUNING),
};
/** A quick flick of the tip down: the cast gesture. */
export const FLICK = [0, 300, 700, 900, 100, 0];
export const swing = () => spin(FLICK);
/** A quick lift of the tip: the strike. */
export const lift = () => spin([-400]);

/** The sensors report, so the game hears them; motion is then on. */
export function sensorsOn(withOrientation = true) {
  if (withOrientation) orient(0, 0);
  spin([0]);
  expect($('#motion-mode-toggle').getAttribute('aria-pressed')).toBe('true');
}

/** At the river with motion switched on in the gear panel, as a desktop opts in. */
export function inMotionRiver(game: Game, { orientation = true } = {}) {
  enterRiver(game);
  openGear(game, 'supplies');
  click('#motion-mode-toggle');
  closeRiverPanel();
  sensorsOn(orientation);
  expect(visible('#motion-fishing')).toBe(true);
  expect(visible('#scene-ready')).toBe(false);
}

/** Ticks until the fish bites. */
export function toBite(game: Game) {
  game.until(() => game.world().fishing.active!.phase === 'hook', 200);
}

const { tiltRangeDeg } = FISHING.motion.gesture;
/**
 * Tilt the rod tip over the fish as drawn until the run ends. The fight centres the tip
 * on the pose held at the bite, here level.
 */
export function followFish(game: Game, eachTick?: () => void) {
  for (let i = 0; i < 800 && game.world().fishing.active; i++) {
    eachTick?.();
    const fish = $('#motion-fish').style;
    const x = ((parseFloat(fish.left) - 50) / 50) * tiltRangeDeg;
    const y = ((parseFloat(fish.top) - 50) / 50) * tiltRangeDeg;
    // The tip eases towards the tilt; a few readings bring it there.
    for (let reading = 0; reading < 8; reading++) orient(x, y);
    game.tick();
  }
}

/** Every river control; none may stay on screen in the city. */
const RIVER_CONTROLS = [
  '#scene-ready',
  '#cast-start',
  '#angling-live',
  '#fish-control',
  '#motion-fishing',
  '#motion-onboarding',
  '#motion-quick',
  '#river-hud',
  '#river-tools-nav',
];

/** Back to the city by the scene switch, with nothing of the river left on screen. */
export function backToCity() {
  click('#visit-city');
  expect($('#visit-city').getAttribute('aria-pressed')).toBe('true');
  for (const control of RIVER_CONTROLS)
    expect(visible(control), control).toBe(false);
  expect(visible('#city-tools-nav')).toBe(true);
}
