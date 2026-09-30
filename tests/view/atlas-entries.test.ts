import { describe, expect, it } from 'vitest';
import { $, choose, click, openGame, text } from '../helpers/view-rig';
import {
  catchFish,
  closeRiverPanel,
  enterRiver,
  openGear,
  showFish,
} from '../helpers/view-player';
import { createWorld, World } from '../../src/core/world';
import { CAT_BREEDS } from '../../src/content/breeds';
import {
  fishById,
  fishHabitats,
  fishStars,
  SPOTS,
  type FishId,
} from '../../src/content/fishing';
import { SCREEN_COPY } from '../../src/view/fishing/screen';

const entry = (species: FishId) => text(`[data-species="${species}"]`);
const option = (species: FishId) =>
  $<HTMLOptionElement>(`#atlas-species option[value="${species}"]`);
/** What an entry says about a species once it is caught. */
const details = (species: FishId) => {
  const fish = fishById(species);
  return [
    fish.name,
    `${fish.price} 金币`,
    fish.behavior,
    fish.clue,
    '体长范围',
    '鱼种最大长度',
    '个人最长',
  ];
};

/** A new game with Pepper invited and these species caught once, at their smallest. */
function caught(...species: FishId[]) {
  const world = createWorld(42);
  expect(world.dispatch({ type: 'INVITE_PEPPER' }).ok).toBe(true);
  const state = world.getSnapshot();
  for (const id of species) {
    const fish = fishById(id);
    Object.assign(state.fishing.atlas[id], {
      count: 1,
      bestWeight: fish.minWeight,
      bestLengthMm: fish.minLengthMm,
    });
  }
  return { 'cat-city.save.v1': new World(state).save() };
}

// User decision, 2026-09-30: a fish never caught keeps its stars and where it may be
// found; everything else waits until it is caught.
describe('the atlas hides what a fish never caught would tell', () => {
  it('shows only its stars and where it may be found, and the picker does not name it', () => {
    const game = openGame();
    showFish(game, 'MOON_CARP');
    const moon = fishById('MOON_CARP');
    expect(entry('MOON_CARP')).toContain(fishStars(moon.stars));
    expect(entry('MOON_CARP')).toContain(SCREEN_COPY.atlas.unknown);
    for (const spot of fishHabitats('MOON_CARP'))
      expect(entry('MOON_CARP')).toContain(SPOTS[spot].name);
    for (const hidden of [...details('MOON_CARP'), '仅限', '品种条件'])
      expect(entry('MOON_CARP')).not.toContain(hidden);
    expect(option('MOON_CARP').text).toBe(
      `${fishStars(moon.stars)} ${SCREEN_COPY.atlas.unknown}`,
    );
  });

  it('a caught fish shows all it tells, with the breed it needs for the chosen cat', () => {
    const game = openGame({ storage: caught('KOI', 'MOON_CARP') });
    showFish(game, 'MOON_CARP');
    for (const shown of [
      ...details('MOON_CARP'),
      `仅限${CAT_BREEDS.BRITISH_SHORTHAIR.name}同行`,
      '需更换同行猫',
    ])
      expect(entry('MOON_CARP')).toContain(shown);
    const moon = fishById('MOON_CARP');
    expect(option('MOON_CARP').text).toBe(
      `${fishStars(moon.stars)} ${moon.name}`,
    );
    showFish(game, 'KOI');
    expect(entry('KOI')).toContain('品种条件已满足');
    // With Pepper, a British Shorthair, the conditions swap.
    const pepper = game
      .world()
      .cats.find((cat) => cat.definitionId === 'PEPPER')!;
    openGear(game);
    choose('#fish-companion', pepper.id);
    showFish(game, 'MOON_CARP');
    expect(entry('MOON_CARP')).toContain('品种条件已满足');
    showFish(game, 'KOI');
    expect(entry('KOI')).toContain('需更换同行猫');
  });

  it('the first catch of a species names it in the same picker option', () => {
    const game = openGame();
    const silver = fishById('SILVER');
    showFish(game, 'SILVER');
    const choice = option('SILVER');
    expect(choice.text).toBe(
      `${fishStars(silver.stars)} ${SCREEN_COPY.atlas.unknown}`,
    );
    expect(entry('SILVER')).not.toContain(silver.clue);
    closeRiverPanel();
    enterRiver(game);
    click('#cast-start');
    catchFish(game);
    expect(game.world().fishing.atlas.SILVER.count).toBe(1);
    showFish(game, 'SILVER');
    expect(option('SILVER')).toBe(choice);
    expect(choice.text).toBe(`${fishStars(silver.stars)} ${silver.name}`);
    for (const shown of details('SILVER'))
      expect(entry('SILVER')).toContain(shown);
  });
});
