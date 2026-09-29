import { beforeAll, describe, expect, it } from 'vitest';
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
import { pondDirection, progressSaves } from '../helpers/fishing-progress';

// Each test starts from progress played once through Core and plays one step in the page.
let saves: ReturnType<typeof progressSaves>;
beforeAll(() => {
  saves = progressSaves();
});
const openAt = (save: string) =>
  openGame({ storage: { 'cat-city.save.v1': save } });
const spotOption = (spotId: string) =>
  $<HTMLOptionElement>(`#fish-location option[value="${spotId}"]`);

describe('skill and atlas unlock a new waterway; bait changes catches and Pepper receives a favorite fish', () => {
  it('the catch that brings skill and atlas far enough opens the reeds', () => {
    const game = openAt(saves.oneCatchShort);
    enterRiver(game);
    openGear(game);
    expect(spotOption('REEDS').disabled).toBe(true);
    choose('#fish-direction', String(pondDirection(3)));
    closeRiverPanel();
    click('#cast-start');
    catchFish(game);
    expect(game.world().fishing.xp).toBe(50);
    openGear(game);
    expect(spotOption('REEDS').disabled).toBe(false);
  });

  it('choosing the reeds sends the cat walking there on the city clock', () => {
    const game = openAt(saves.reedsOpen);
    openGear(game);
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
  });

  it('worms at the reeds catch a perch without another walk', () => {
    const game = openAt(saves.atReeds);
    const arrived = game.world();
    enterRiver(game);
    openGear(game);
    choose('#fish-bait', 'WORM');
    closeRiverPanel();
    expect($<HTMLButtonElement>('#cast-start').disabled).toBe(false);
    click('#cast-start');
    catchFish(game);
    const world = game.world();
    expect(world.minute).toBe(arrived.minute);
    expect(
      world.fishing.inventory.find((fish) => fish.speciesId === 'PERCH'),
    ).toBeDefined();
  });

  it('Pepper, invited and chosen, shows her tastes and takes the perch as a favorite', () => {
    const game = openAt(saves.perchAtReeds);
    const perch = game
      .world()
      .fishing.inventory.find((fish) => fish.speciesId === 'PERCH')!;
    enterRiver(game);
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
