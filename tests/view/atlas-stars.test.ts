import { beforeAll, describe, expect, it } from 'vitest';
import { $, choose, click, openGame, text, visible } from '../helpers/view-rig';
import {
  catchFish,
  closeRiverPanel,
  enterRiver,
  openGear,
  showFish,
} from '../helpers/view-player';
import { progressSaves } from '../helpers/fishing-progress';
import {
  FISH,
  fishById,
  lengthStar,
  type FishId,
} from '../../src/content/fishing';
import { SCREEN_COPY } from '../../src/view/fishing/screen';

// Each test starts from progress played once through Core and plays one step in the page.
let saves: ReturnType<typeof progressSaves>;
beforeAll(() => {
  saves = progressSaves();
});
const openAt = (save: string) =>
  openGame({ storage: { 'cat-city.save.v1': save } });

/**
 * The save with these species' records at these lengths; a fish in the bag longer than
 * its record goes, as if sold, since a record is never shorter than a fish kept.
 */
function withRecords(save: string, records: Partial<Record<FishId, number>>) {
  const data = JSON.parse(save);
  const fishing = data.world.fishing;
  for (const [species, lengthMm] of Object.entries(records)) {
    fishing.atlas[species].bestLengthMm = lengthMm;
    fishing.inventory = fishing.inventory.filter(
      (fish: { speciesId: string; lengthMm: number }) =>
        fish.speciesId !== species || fish.lengthMm <= lengthMm,
    );
  }
  return JSON.stringify(data);
}
/** The shortest record of a species that earns this many stars. */
function shortestWith(species: FishId, stars: number) {
  const fish = fishById(species);
  let length = fish.minLengthMm;
  while (lengthStar(species, length) < stars) length++;
  return length;
}
const collected = (stars: number) =>
  SCREEN_COPY.atlas.label(SCREEN_COPY.atlas.stars.slice(0, stars));
/** Silver caught at its longest (all three stars), crucian just at bronze. */
const rated = () =>
  withRecords(saves.oneCatchShort, {
    SILVER: fishById('SILVER').maxLengthMm,
    CRUCIAN: shortestWith('CRUCIAN', 1),
  });

describe('the atlas rates each caught species by its record (R-54, ui-design 5.9)', () => {
  it('shows bronze, silver and gold as collected or not for caught fish only, with no threshold', () => {
    const game = openAt(rated());
    const atlas = game.world().fishing.atlas;
    expect(FISH.filter((fish) => atlas[fish.id].count)).toHaveLength(2);
    enterRiver(game);
    for (const fish of FISH) {
      showFish(game, fish.id);
      const entry = $(`[data-species="${fish.id}"]`);
      const record = atlas[fish.id];
      if (!record.count) {
        expect(entry.querySelector('.length-stars')).toBeNull();
        expect(entry.dataset.lengthStars).toBeUndefined();
        continue;
      }
      const stars = lengthStar(fish.id, record.bestLengthMm);
      expect(stars).toBe(fish.id === 'SILVER' ? 3 : 1);
      expect(entry.dataset.lengthStars).toBe(String(stars));
      const shown = `[data-species="${fish.id}"] .length-stars`;
      expect(visible(shown)).toBe(true);
      expect($(shown).getAttribute('aria-label')).toBe(collected(stars));
      expect(entry.querySelectorAll('.length-stars i')).toHaveLength(3);
      expect(entry.querySelectorAll('.length-stars .lit')).toHaveLength(stars);
      expect(text(shown)).toContain(SCREEN_COPY.atlas.names[2]);
      expect(entry.textContent).not.toContain('再长');
    }
  });

  it('rings the picture of a three-star fish in gold, and only that one', () => {
    const game = openAt(rated());
    enterRiver(game);
    const ring = (species: FishId) => {
      showFish(game, species);
      return getComputedStyle(
        $(`[data-species="${species}"] .fish-silhouette svg`),
      ).outlineStyle;
    };
    expect(ring('SILVER')).toBe('solid');
    expect(ring('CRUCIAN')).not.toBe('solid');
  });
});

describe('a catch that adds to the atlas says so where the catch shows', () => {
  it('the first perch is named new on the catch card and in the result line', () => {
    const game = openAt(saves.atReeds);
    expect(game.world().fishing.atlas.PERCH.count).toBe(0);
    enterRiver(game);
    openGear(game);
    choose('#fish-bait', 'WORM');
    closeRiverPanel();
    click('#cast-start');
    catchFish(game);
    const result = game.world().fishing.lastResult!;
    expect(result.speciesId).toBe('PERCH');
    const stars = lengthStar('PERCH', result.lengthMm);
    const note = SCREEN_COPY.atlas.newSpecies(
      fishById('PERCH').name,
      stars ? SCREEN_COPY.atlas.stars[stars - 1]! : null,
    );
    expect(visible('#catch-reveal')).toBe(true);
    expect(text('#catch-reveal')).toContain(note);
    expect(text('#fish-result')).toContain(note);
  });
});
