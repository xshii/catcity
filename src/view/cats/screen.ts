import { CAT_BREEDS } from '../../content/breeds';
import { fishById, SPOTS } from '../../content/fishing';
import { MAX_STAT, type WorldState } from '../../core';
import { catPortrait } from '../art/illustrations';
import { catLook, catPose } from '../art/cat-look';
import { bondBadge } from '../shell/bond';
import { moodBadge } from '../shell/mood';
import { toViewModel } from '../shell/model';
import type { CatsView } from './view-state';

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

/**
 * The selected cat's card in the cats panel (spec 041 T-12): its name, mood, traits and
 * bond, or a greeting while no cat is selected. The reunion and bond lines speak of the
 * selected cat, else the first.
 */
export function catDetail(
  world: WorldState,
  selected: string | null,
  view: CatsView,
) {
  const cat = toViewModel(world, selected).cat;
  const mood = cat?.moodBadge;
  const told =
    world.cats.find((item) => item.id === selected) ?? world.cats[0]!;
  const fishing = told.fishingMemory;
  const gift = told.fishGift;
  return {
    known: !!cat,
    name: cat?.name ?? '认识 Mochi',
    mood: {
      text: mood?.text ?? '第一位居民',
      label: mood?.label ?? '第一位居民',
      hint: mood?.hint ?? '',
    },
    cat: cat && {
      talk: `和 ${cat.name} 说句话`,
      gray: cat.appearance.coat === 'gray',
      traits: cat.personalityLabel,
      bond: cat.bondBadge,
      news: view.news.catId === cat.id ? view.news.note : '',
    },
    reunion: fishing
      ? `你又来啦。还想去我们第一次钓鱼的${SPOTS[fishing.spotId].name}吗？`
      : gift
        ? `你送我的${fishById(gift.speciesId).name}，我还记得呢。`
        : `我是 ${told.name}。这里给你留了个位置。`,
    together:
      fishing || gift
        ? '有了一段共同回忆'
        : told.memories.length
          ? '已经聊过几次'
          : '初次见面 · 不用急着熟悉',
  };
}
