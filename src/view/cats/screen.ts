import { CAT_BREEDS } from '../../content/breeds';
import { SPOTS } from '../../content/fishing';
import { MAX_STAT, type WorldState } from '../../core';
import { catPortrait } from '../art/illustrations';
import { catLook, catPose } from '../art/cat-look';
import { bondBadge } from '../shell/bond';
import { moodBadge } from '../shell/mood';

/**
 * The roster's cards, one per cat in the world's order (spec 041 T-12). The marked cat is
 * the one with the player: the cat on the rod while a run lasts, else the selected one,
 * else the first. `river`: the river is on screen, where that cat stays awake (R-01).
 */
export function rosterScreen(
  world: WorldState,
  selected: string | null,
  river: boolean,
) {
  const marked = (
    world.cats.find(
      (cat) => cat.id === (world.fishing.active?.catId ?? selected),
    ) ?? world.cats[0]!
  ).id;
  return world.cats.map((cat) => {
    const pose = catPose(world, cat, { atRiver: river && cat.id === marked });
    const level = bondBadge(cat.playerBond);
    return {
      id: cat.id,
      portrait: catPortrait(catLook(cat), pose),
      pressed: cat.id === marked,
      disabled: !!world.fishing.active,
      name: cat.name,
      energy: `${CAT_BREEDS[cat.breedId].name} · ${cat.needs.energy}/${MAX_STAT}`,
      energyValue: cat.needs.energy,
      energyLabel: `${cat.name} 体力`,
      activity: cat.walk
        ? `步行中 · 剩 ${cat.walk.route.length} 格`
        : cat.fishingSpotId
          ? `在${SPOTS[cat.fishingSpotId].name}岸边`
          : '在小城里',
      // The curled portrait shows it; the card also says it in words.
      resting: pose.curled,
      mood: moodBadge(cat.mood),
      bond: { text: `${level.hearts} ${level.name}`, label: level.label },
    };
  });
}
export type RosterCard = ReturnType<typeof rosterScreen>[number];
