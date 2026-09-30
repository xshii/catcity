import { describe, expect, it, vi } from 'vitest';
import {
  $,
  click,
  openGame,
  text,
  visible,
  type Game,
} from '../helpers/view-rig';
import { CATCH_CARD_MS } from '../../src/view/fishing/screen';
import {
  catchFish,
  closeRiverPanel,
  closeSettings,
  enterRiver,
  openCats,
  openGear,
  openSettings,
} from '../helpers/view-player';

const CARD = '#catch-reveal';

/** A catch on this visit to the river: its card shows, its countdown from the start. */
function landFish(game: Game) {
  enterRiver(game);
  closeRiverPanel();
  click('#cast-start');
  catchFish(game);
  expect(visible(CARD)).toBe(true);
}

/** The card is still there just before its time would run out, and gone at it. */
function closesAfter(game: Game, ms: number) {
  game.wait(ms - 100);
  expect(visible(CARD)).toBe(true);
  game.wait(100);
  expect(visible(CARD)).toBe(false);
}

/** The page goes to the background, or comes back, as the browser says. */
function pageHidden(hidden: boolean) {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(hidden);
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('the catch card counts down (R-02)', () => {
  it('closes by itself 4 seconds after it shows; the catch stays in the result line and the bag', () => {
    const game = openGame();
    landFish(game);
    const bar = $(`${CARD} .catch-countdown`);
    expect(bar.getAttribute('aria-hidden')).toBe('true');
    expect($(CARD).style.getPropertyValue('--catch-card-ms')).toBe(
      `${CATCH_CARD_MS}ms`,
    );
    expect($(CARD).dataset.countdown).toBe('running');
    closesAfter(game, CATCH_CARD_MS);
    expect(text('#fish-result')).toContain('钓到了');
    expect(game.world().fishing.inventory).toHaveLength(1);
    // The next catch shows its own card, for its full time.
    click('#cast-start');
    catchFish(game);
    expect(visible(CARD)).toBe(true);
    closesAfter(game, CATCH_CARD_MS);
  });

  it('clock ticks keep the card, its bar and its countdown', () => {
    const game = openGame();
    landFish(game);
    const card = $(CARD);
    const bar = $(`${CARD} .catch-countdown`);
    game.wait(1000);
    for (let tick = 0; tick < 5; tick++)
      game.session.execute({ type: 'ADVANCE_TIME', minutes: 1 });
    expect($(CARD)).toBe(card);
    expect($(`${CARD} .catch-countdown`)).toBe(bar);
    closesAfter(game, CATCH_CARD_MS - 1000);
  });

  it('a tap closes it at once; the next catch still has its full time', () => {
    const game = openGame();
    landFish(game);
    click(CARD);
    expect(visible(CARD)).toBe(false);
    expect(text('#fish-result')).toContain('钓到了');
    click('#cast-start');
    catchFish(game);
    expect(visible(CARD)).toBe(true);
    closesAfter(game, CATCH_CARD_MS);
  });

  for (const [name, takeAway] of [
    ['a tap', () => click(CARD)],
    ['the next cast', () => click('#cast-start')],
    ['leaving the river', () => click('#visit-city')],
  ] as const)
    it(`gone by ${name}, it leaves no countdown behind to fire later`, () => {
      const game = openGame();
      landFish(game);
      const pending = vi.getTimerCount();
      takeAway();
      expect(visible(CARD)).toBe(false);
      expect(vi.getTimerCount()).toBe(pending - 1);
    });

  for (const [name, cover, uncover] of [
    ['the cats panel', () => openCats(), closeRiverPanel],
    ['the gear panel', (game: Game) => openGear(game), closeRiverPanel],
    ['the settings', openSettings, closeSettings],
    ['a hidden page', () => pageHidden(true), () => pageHidden(false)],
  ] as const)
    it(`waits under ${name}: 10 seconds later it is still there and counts the rest`, () => {
      const game = openGame();
      landFish(game);
      game.wait(1000);
      cover(game);
      expect($(CARD).dataset.countdown).toBe('held');
      game.wait(10_000);
      uncover();
      expect(visible(CARD)).toBe(true);
      expect($(CARD).dataset.countdown).toBe('running');
      closesAfter(game, CATCH_CARD_MS - 1000);
    });
});
