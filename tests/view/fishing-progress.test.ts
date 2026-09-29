import { describe, expect, it } from 'vitest';
import { FISHING } from '../../src/content/fishing';
import { $, choose, click, openGame, text } from '../helpers/view-rig';
import {
  catchFish,
  closeRiverPanel,
  enterRiver,
  openCats,
  openGear,
  reachWaterway,
  showBagFish,
} from '../helpers/view-player';

const spotOption = (spotId: string) =>
  $<HTMLOptionElement>(`#fish-location option[value="${spotId}"]`);

describe('fishing progress', () => {
  it('skill and atlas unlock a new waterway; bait changes catches and Pepper receives a favorite fish', () => {
    const game = openGame();
    enterRiver(game);
    openGear(game);
    expect(spotOption('REEDS').disabled).toBe(true);
    for (let cast = 0; cast < 4; cast++) {
      openGear(game);
      // The slider's ends, where Home and End put it: left, then right of the pond.
      const end = FISHING.input.maxDirection * (cast % 2 ? 1 : -1);
      choose('#fish-direction', String(end));
      closeRiverPanel();
      click('#cast-start');
      catchFish(game);
    }
    expect(game.world().fishing.xp).toBe(50);
    openGear(game);
    expect(spotOption('REEDS').disabled).toBe(false);
    const beforeTravel = game.world();
    choose('#fish-location', 'REEDS');
    expect($('#visit-city').getAttribute('aria-pressed')).toBe('true');
    expect(game.world().minute).toBe(beforeTravel.minute);
    reachWaterway('REEDS');
    const arrived = game.world();
    expect(arrived.minute).toBeGreaterThan(beforeTravel.minute);
    expect(arrived.cats[0]!.needs.energy).toBeLessThan(
      beforeTravel.cats[0]!.needs.energy,
    );
    expect(arrived.cats[0]!.fishingSpotId).toBe('REEDS');
    enterRiver(game);
    openGear(game);
    expect($<HTMLButtonElement>('#travel-to-spot').disabled).toBe(true);
    choose('#fish-bait', 'WORM');
    closeRiverPanel();
    expect($<HTMLButtonElement>('#cast-start').disabled).toBe(false);
    click('#cast-start');
    catchFish(game);
    const world = game.world();
    expect(world.minute).toBe(arrived.minute);
    const perch = world.fishing.inventory.find(
      (fish) => fish.speciesId === 'PERCH',
    )!;
    expect(perch).toBeDefined();
    openCats();
    click('#invite-pepper');
    closeRiverPanel();
    const pepper = game
      .world()
      .cats.find((cat) => cat.definitionId === 'PEPPER')!;
    openGear(game);
    choose('#fish-companion', pepper.id);
    showBagFish(game, perch.id);
    expect(text('#fish-tastes')).toContain('鲈鱼、鲶鱼');
    click(`[data-gift-fish="${perch.id}"]`);
    expect(
      game.world().cats.find((cat) => cat.id === pepper.id)!.fishGift!.favorite,
    ).toBe(true);
  });
});
