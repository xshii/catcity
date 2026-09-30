import { describe, expect, it } from 'vitest';
import { $, click, key, openGame, text, visible } from '../helpers/view-rig';
import { openCats } from '../helpers/view-player';
import { BOND } from '../../src/content/care';
import { PETTING, type PetSpot } from '../../src/content/petting';
import { pettingTastes } from '../../src/core';
import { createWorld } from '../../src/core/world';

const TICK_MS = 1000 / PETTING.ticksPerSecond;
const { favourite, disliked } = pettingTastes(42, 'mochi');
const spot = (id: PetSpot) => `[data-spot="${id}"]`;
const focused = () => (document.activeElement as HTMLElement).dataset.spot;
const arrow = (name: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown') =>
  document.activeElement!.dispatchEvent(
    new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: name,
    }),
  );
/** Space or Enter on the focused button, as a browser turns it into a click. */
const press = () => (document.activeElement as HTMLElement).click();
const lastCommand = (game: ReturnType<typeof openGame>) =>
  game.session.lastCommand();

function startPetting() {
  const game = openGame();
  openCats('roster');
  click('#pet-cat');
  expect(visible('#petting')).toBe(true);
  return game;
}

describe('petting from the cats panel (spec 039)', () => {
  it('offers the selected cat, free of charge, with nothing known yet', () => {
    openGame();
    openCats('roster');
    expect(text('#pet-cat')).toBe('摸摸 Mochi');
    expect(text('#pet-cat-note')).toBe('不花体力和金币，想摸就摸');
    expect(visible('#pet-cat-known')).toBe(false);
    expect(visible('#petting')).toBe(false);
  });

  it('plays a whole round by keyboard and shows what Core made of it', () => {
    const game = startPetting();
    const before = game.world().cats[0]!;
    expect(visible('#river-tools')).toBe(false);
    expect($('#petting-meter').getAttribute('aria-valuenow')).toBe('0');
    // The arrows reach every spot; the favourite is stroked once in each purr.
    expect(focused()).toBe('HEAD');
    for (let moves = 0; moves < 4 && focused() !== favourite; moves++)
      arrow(moves % 2 ? 'ArrowDown' : 'ArrowRight');
    expect(focused()).toBe(favourite);
    for (let purr = 0; purr < 8; purr++) {
      expect($('#petting-cat').dataset.purr).toBe('true');
      press();
      expect(text('#petting-bubble')).toBe('呼噜呼噜♪');
      if (purr < 7) game.wait(PETTING.purr.periodTicks * TICK_MS);
    }
    expect($(spot(favourite)).dataset.known).toBe('true');
    expect($('#petting-meter').getAttribute('aria-valuenow')).toBe('80');
    // Nothing reached the world while the round was going.
    expect(lastCommand(game)).toBeNull();
    expect(visible('#petting-result')).toBe(false);
    game.wait(PETTING.roundTicks * TICK_MS);

    expect(visible('#petting-result')).toBe(true);
    const settled = lastCommand(game)!;
    expect(settled.command).toEqual({
      type: 'PET_CAT',
      catId: 'mochi',
      strokes: Array.from({ length: 8 }, (_, purr) => ({
        tick: purr * PETTING.purr.periodTicks,
        spot: favourite,
      })),
    });
    expect(settled.result).toMatchObject({
      ok: true,
      events: [{ type: 'CatPetted', meter: 80, mood: 6, full: true }],
    });
    expect(text('#petting-change')).toBe('心情 +6');
    expect(text('#petting-line')).toContain('再摸一会儿也可以');
    const after = game.world().cats[0]!;
    expect(after.mood).toBe(before.mood + 6);
    expect(after.playerBond).toBe(before.playerBond + BOND.petting);
    expect(after.petting.discovered).toEqual([favourite]);
    // The keyboard goes on from the result.
    expect((document.activeElement as HTMLElement).id).toBe('petting-again');
    click('#petting-done');
    expect(visible('#petting')).toBe(false);
    openCats('roster');
    expect(text('#pet-cat-known')).toContain('最喜欢');
  });

  it('takes strokes from a pointer, and the cat pulls away from the spot it dislikes', () => {
    const game = startPetting();
    click(spot(favourite));
    expect($('#petting-meter').getAttribute('aria-valuenow')).toBe(
      String(PETTING.meter.favourite.purring),
    );
    game.wait(10 * TICK_MS);
    click(spot(disliked));
    expect($('#petting-cat').dataset.away).toBe('true');
    expect(text('#petting-hint')).toBe('Mochi 躲开了，等它回来');
    expect(text('#petting-bubble')).toBe('不要摸这里');
    expect($(spot(disliked)).getAttribute('aria-label')).toContain('不喜欢');
    // A stroke while it is away is not taken.
    click(spot(favourite));
    game.wait(PETTING.awayTicks * TICK_MS);
    expect($('#petting-cat').dataset.away).toBe('false');
    game.wait(PETTING.roundTicks * TICK_MS);
    const settled = lastCommand(game)!.command;
    expect(settled.type === 'PET_CAT' && settled.strokes).toEqual([
      { tick: 0, spot: favourite },
      { tick: 10, spot: disliked },
    ]);
  });

  it('leaving in the middle of a round changes nothing', () => {
    const game = startPetting();
    const before = game.world();
    click(spot(favourite));
    game.wait(40 * TICK_MS);
    key('keydown', 'Escape');
    expect(visible('#petting')).toBe(false);
    game.wait(PETTING.roundTicks * TICK_MS);
    expect(lastCommand(game)).toBeNull();
    expect(game.world()).toEqual(before);
    // The next round starts from nothing.
    openCats('roster');
    click('#pet-cat');
    expect($('#petting-meter').getAttribute('aria-valuenow')).toBe('0');
    expect($(spot(favourite)).dataset.known).toBe('false');
  });

  it('a round without a stroke sends nothing', () => {
    const game = startPetting();
    game.wait(PETTING.roundTicks * TICK_MS);
    expect(visible('#petting-result')).toBe(true);
    expect(text('#petting-line')).toBe('这一回还没摸到它。想摸的时候再来。');
    expect(visible('#petting-change')).toBe(false);
    expect(lastCommand(game)).toBeNull();
    click('#petting-again');
    expect(visible('#petting-result')).toBe(false);
    expect(text('#petting-time')).toBe('12 秒');
  });

  it('is closed for a cat in a fishing run, with the reason', () => {
    const world = createWorld(42);
    world.dispatch({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      spotId: 'POND',
      baitId: 'BREAD',
      direction: -30,
      aimDepth: 50,
    });
    expect(world.getSnapshot().fishing.active).not.toBeNull();
    openGame({ storage: { 'cat-city.save.v1': world.save() } });
    openCats('roster');
    expect($<HTMLButtonElement>('#pet-cat').disabled).toBe(true);
    expect(text('#pet-cat-note')).toBe('这只猫正在钓鱼，先收好鱼竿再安排。');
  });
});
