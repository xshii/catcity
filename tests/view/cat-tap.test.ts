import { describe, expect, it } from 'vitest';
import { FISHING } from '../../src/content/fishing';
import { moodBand } from '../../src/content/mood';
import { CAT_LINES, CAT_TAP_MS } from '../../src/view/fishing/screen';
import {
  $,
  click,
  key,
  openGame,
  text,
  visible,
  type Game,
} from '../helpers/view-rig';
import {
  backToCity,
  enterRiver,
  followFish,
  inMotionRiver,
  lift,
  SEASONED,
  swing,
  toBite,
} from '../helpers/view-player';

const CAT = '#river-cat';
const BUBBLE = '#river-cat-bubble';
/** FISH_STRIKE commands the page has sent so far. */
const strikes = (game: Game) =>
  game.session
    .getReplay()
    .entries.filter((entry) => entry.command.type === 'FISH_STRIKE').length;
const phase = (game: Game) => game.world().fishing.active?.phase;

describe('tapping the cat at the river (R-03)', () => {
  it('is a button over the cat, named for it, on the river only and not part of the water', () => {
    const game = openGame();
    expect(visible(CAT)).toBe(false);
    enterRiver(game);
    expect(visible(CAT)).toBe(true);
    const cat = $<HTMLButtonElement>(CAT);
    expect(cat.tagName).toBe('BUTTON');
    expect(cat.tabIndex).toBe(0);
    expect(cat.getAttribute('aria-label')).toBe(
      CAT_LINES.label(game.world().cats[0]!.name),
    );
    expect(cat.getAttribute('aria-label')).toBe('摸摸 Mochi');
    // Over the water plane, not in it: the plane's taps strike.
    expect(cat.closest('#motion-fishing')).toBeNull();
    backToCity();
    expect(visible(CAT)).toBe(false);
    expect(visible(BUBBLE)).toBe(false);
  });

  it('keeps the same button through clock ticks', () => {
    const game = openGame();
    enterRiver(game);
    const cat = $(CAT);
    cat.focus();
    for (let tick = 0; tick < 5; tick++)
      expect(
        game.session.execute({ type: 'ADVANCE_TIME', minutes: 10 }).ok,
      ).toBe(true);
    expect($(CAT)).toBe(cat);
    expect(document.activeElement).toBe(cat);
  });

  it('Enter gets a line in a bubble for 1.5 s; a press within 0.5 s is the same tap, a later one the next line', () => {
    const game = openGame();
    enterRiver(game);
    const lines = CAT_LINES.idle[moodBand(game.world().cats[0]!.mood)];
    expect($(BUBBLE).getAttribute('aria-live')).toBe('polite');
    expect(visible(BUBBLE)).toBe(false);
    // Keyboard only: focus the cat and press Enter.
    $(CAT).focus();
    key('keydown', 'Enter');
    expect(visible(BUBBLE)).toBe(true);
    expect(text(BUBBLE)).toBe(lines[0]);
    game.wait(CAT_TAP_MS.repeat - 1);
    key('keydown', 'Enter');
    expect(text(BUBBLE)).toBe(lines[0]);
    // The ignored press kept the first bubble's time.
    game.wait(1);
    key('keydown', 'Enter');
    expect(text(BUBBLE)).toBe(lines[1]);
    // The new line replaces the old one and stays its own 1.5 s.
    game.wait(CAT_TAP_MS.bubble - 1);
    expect(visible(BUBBLE)).toBe(true);
    game.wait(1);
    expect(visible(BUBBLE)).toBe(false);
  });

  it('whispers while the float waits and cheers a fight on, never striking; then is glad of the catch', () => {
    const game = openGame({ storage: SEASONED });
    inMotionRiver(game);
    swing();
    expect(phase(game)).toBe('waiting');
    click(CAT);
    expect(text(BUBBLE)).toBe(CAT_LINES.waiting[0]);
    expect(strikes(game)).toBe(0);
    expect(phase(game)).toBe('waiting');
    toBite(game);
    game.wait(FISHING.motion.gesture.liftCooldownMs);
    lift();
    expect(phase(game)).toBe('fight');
    const hooked = strikes(game);
    game.wait(CAT_TAP_MS.repeat);
    click(CAT);
    expect(text(BUBBLE)).toBe(CAT_LINES.cheer[1]);
    expect(strikes(game)).toBe(hooked);
    expect(phase(game)).toBe('fight');
    followFish(game);
    expect(game.world().fishing.lastResult!.caught).toBe(true);
    game.wait(CAT_TAP_MS.repeat);
    click(CAT);
    expect(text(BUBBLE)).toBe(CAT_LINES.caught[0]);
  });
});
