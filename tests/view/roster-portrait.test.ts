import { expect, it } from 'vitest';
import { $, openGame } from '../helpers/view-rig';
import { openCats } from '../helpers/view-player';
import { createWorld } from '../../src/core/world';
import { invite } from '../helpers/world';
import { catLook, catPose, portraitShapes } from '../../src/view/art/cat-look';

it('draws each cat in the roster with its own breed’s outline and coat (R-15)', () => {
  const world = createWorld(42);
  invite(world);
  const game = openGame({ storage: { 'cat-city.save.v1': world.save() } });
  openCats('roster');
  const shown = game.world();
  const drawn = new Set<string>();
  for (const cat of shown.cats) {
    const look = catLook(cat);
    const paths = portraitShapes(look.breed, catPose(shown, cat))
      .filter((shape) => shape.d)
      .map((shape) => shape.d);
    const svg = $(`[data-cat-id="${cat.id}"] svg`);
    expect(
      Array.from(svg.querySelectorAll('path'), (path) =>
        path.getAttribute('d'),
      ),
    ).toEqual(paths);
    drawn.add(svg.innerHTML);
  }
  // Mochi is a cream ragdoll and Pepper a gray shorthair: two different drawings.
  expect(drawn.size).toBe(2);
});
