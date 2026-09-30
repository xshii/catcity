import { describe, expect, it } from 'vitest';
import { MAX_STAT } from '../../src/core';
import { createWorld } from '../../src/core/world';
import { finishFishing } from '../unit/fishing-fixture';
import { $, choose, click, openGame, text } from '../helpers/view-rig';
import { enterRiver, openGear, showBagFish } from '../helpers/view-player';
import { invite } from '../helpers/world';

/** Mochi's two pond catches, played through Core; Pepper invited when asked for. */
function twoFish({ pepper = false } = {}) {
  const world = createWorld(42);
  for (const direction of [-30, 30]) {
    expect(
      world.dispatch({
        type: 'FISH_BEGIN',
        catId: 'mochi',
        spotId: 'POND',
        baitId: 'BREAD',
        direction,
        aimDepth: 50,
      }).ok,
    ).toBe(true);
    finishFishing(world);
  }
  if (pepper) invite(world);
  expect(world.getSnapshot().fishing.inventory).toHaveLength(2);
  return { 'cat-city.save.v1': world.save() };
}

const buttons = () =>
  Array.from(
    document.querySelectorAll<HTMLButtonElement>('#fish-inventory button'),
  );
const sell = (fishId: string) => $(`[data-sell-fish="${fishId}"]`);
const gift = (fishId: string) => $(`[data-gift-fish="${fishId}"]`);

// In the browser the clock changes the world every second and an idle cat recovers
// energy: a tap that spans a tick, or keyboard focus, must not lose its button.
describe('the fish bag keeps its buttons', () => {
  it('through clock ticks while the cat recovers', () => {
    const game = openGame({ storage: twoFish() });
    const [first, second] = game.world().fishing.inventory;
    enterRiver(game);
    showBagFish(game, first!.id);
    const before = buttons();
    expect(before).toHaveLength(4);
    before[1]!.focus();
    const energy = game.world().cats[0]!.needs.energy;
    expect(energy).toBeLessThan(MAX_STAT);
    for (let tick = 0; tick < 5; tick++)
      expect(
        game.session.execute({ type: 'ADVANCE_TIME', minutes: 10 }).ok,
      ).toBe(true);
    expect(game.world().cats[0]!.needs.energy).toBeGreaterThan(energy);
    const after = buttons();
    expect(after).toHaveLength(before.length);
    after.forEach((button, index) => expect(button).toBe(before[index]));
    expect(before.every((button) => button.isConnected)).toBe(true);
    expect(document.activeElement).toBe(before[1]);
    // The kept buttons still work.
    click(`[data-sell-fish="${first!.id}"]`);
    expect(game.world().fishing.inventory.map((fish) => fish.id)).toEqual([
      second!.id,
    ]);
  });

  it('selling one fish keeps the other fish’s buttons', () => {
    const game = openGame({ storage: twoFish() });
    const [first, second] = game.world().fishing.inventory;
    enterRiver(game);
    showBagFish(game, first!.id);
    const kept = [sell(second!.id), gift(second!.id)];
    click(`[data-sell-fish="${first!.id}"]`);
    expect(game.world().fishing.inventory.map((fish) => fish.id)).toEqual([
      second!.id,
    ]);
    // `toEqual` compares markup; the same elements are what a tap keeps.
    const after = buttons();
    expect(after).toHaveLength(kept.length);
    after.forEach((button, index) => expect(button).toBe(kept[index]));
    expect(sell(second!.id)).toBe(kept[0]);
    expect(gift(second!.id)).toBe(kept[1]);
    kept.forEach((button) => expect(button.isConnected).toBe(true));
    expect(document.querySelector(`[data-sell-fish="${first!.id}"]`)).toBe(
      null,
    );
  });

  it('another chosen cat renames the gift button in place, and the gift goes to it', () => {
    const game = openGame({ storage: twoFish({ pepper: true }) });
    const [fish] = game.world().fishing.inventory;
    const pepper = game
      .world()
      .cats.find((cat) => cat.definitionId === 'PEPPER')!;
    enterRiver(game);
    showBagFish(game, fish!.id);
    const button = gift(fish!.id);
    expect(button.textContent).toContain('送给 Mochi');
    openGear(game);
    choose('#fish-companion', pepper.id);
    showBagFish(game, fish!.id);
    expect(gift(fish!.id)).toBe(button);
    expect(button.textContent).toContain('送给 Pepper');
    expect(text('#fish-tastes')).toContain('Pepper 喜欢');
    click(`[data-gift-fish="${fish!.id}"]`);
    const [mochi, invited] = game.world().cats;
    expect(invited!.id).toBe(pepper.id);
    expect(invited!.fishGift?.fishId).toBe(fish!.id);
    expect(mochi!.fishGift).toBeNull();
  });
});
