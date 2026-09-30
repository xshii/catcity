import { fishById, SPOTS } from '../../content/fishing';
import type { CatEntity, WorldState } from '../../core';
import { catPortrait } from '../art/illustrations';
import { catLook, catPose } from '../art/cat-look';
import { bondBadge } from '../shell/bond';
import { moodBadge } from '../shell/mood';
import { toViewModel } from '../shell/model';
import type { CatsView } from './view-state';

/** Player-facing words of the roster (ui-design 5.1). */
const CATS_COPY = {
  /** R-34: the first cats and the invited ones are 一代目. */
  generation: (generation: number) =>
    `${'一二三四五六七八九十'[generation - 1] ?? generation}代目`,
  /** Sex as a symbol, and the word a screen reader says (ui-design 2.2: no colours). */
  sex: {
    F: { mark: '♀', label: '母' },
    M: { mark: '♂', label: '公' },
  } satisfies Record<CatEntity['sex'], { mark: string; label: string }>,
} as const;

/** The cat with the player: the one on the rod while a run lasts, else the selected one, else the first. */
function markedId(world: WorldState, selected: string | null) {
  return (
    world.cats.find(
      (cat) => cat.id === (world.fishing.active?.catId ?? selected),
    ) ?? world.cats[0]!
  ).id;
}

/** How the cat is drawn: at the river the cat with the player stays awake (R-01). */
function pose(
  world: WorldState,
  cat: CatEntity,
  marked: string,
  river: boolean,
) {
  return catPose(world, cat, { atRiver: river && cat.id === marked });
}

/**
 * The roster's rows, one per cat in the order they came (spec 041 T-12, ui-design 5.1).
 * The marked row is the cat with the player. `river`: the river is on screen.
 */
export function rosterScreen(
  world: WorldState,
  selected: string | null,
  river: boolean,
) {
  const marked = markedId(world, selected);
  return world.cats.map((cat) => {
    const drawn = pose(world, cat, marked, river);
    const level = bondBadge(cat.playerBond);
    return {
      id: cat.id,
      portrait: catPortrait(catLook(cat), drawn),
      pressed: cat.id === marked,
      disabled: !!world.fishing.active,
      name: cat.name,
      sex: CATS_COPY.sex[cat.sex],
      generation: CATS_COPY.generation(cat.generation),
      energy: `体力 ${cat.needs.energy}`,
      energyValue: cat.needs.energy,
      energyLabel: `${cat.name} 体力`,
      // The curled portrait shows it; the card also says it in words.
      resting: drawn.curled,
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
