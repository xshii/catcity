import { CAT_BREEDS } from '../../content/breeds';
import { CAT_DEFINITIONS } from '../../content/cats';
import { fishById, SPOTS } from '../../content/fishing';
import {
  MAX_STAT,
  pettingTastes,
  type CatEntity,
  type WorldState,
} from '../../core';
import { catPortrait } from '../art/illustrations';
import { catPose, lookOf } from '../art/cat-look';
import { PETTING_COPY, knownTastes } from '../petting/screen';
import { bondBadge } from '../shell/bond';
import { moodBadge } from '../shell/mood';
import { toViewModel } from '../shell/model';
import { INVITE_COPY } from './invite-screen';
import { CATS_SECTIONS, type CatsSection, type CatsView } from './view-state';

/** Player-facing words of the roster and a cat's detail (ui-design 5.1, 5.2). */
export const CATS_COPY = {
  /** R-34: the first cats and the invited ones are 一代目. */
  generation: (generation: number) =>
    `${'一二三四五六七八九十'[generation - 1] ?? generation}代目`,
  /** Sex as a symbol, and the word a screen reader says (ui-design 2.2: no colours). */
  sex: {
    F: { mark: '♀', label: '母' },
    M: { mark: '♂', label: '公' },
  } satisfies Record<CatEntity['sex'], { mark: string; label: string }>,
  details: '详情 ›',
  back: INVITE_COPY.back,
  backLabel: INVITE_COPY.backLabel,
  sections: {
    now: '现在',
    likes: '喜好',
    family: '家人',
  } satisfies Record<CatsSection, string>,
  // T-24 names the parents and the kittens; until T-22 every cat is first-generation.
  fromAfar: '从别处来到小城',
  noKittens: '还没有孩子',
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
 * The marked row is the cat with the player, and only it offers the cat's detail.
 * `river`: the river is on screen.
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
      portrait: catPortrait(lookOf(cat), drawn),
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
      details: `${cat.name} 的详情`,
    };
  });
}
export type RosterCard = ReturnType<typeof rosterScreen>[number];

const line = (
  label: string,
  text: string,
  note = '',
  meter: { value: number; max: number } | null = null,
) => ({ label, text, meter, note });

/**
 * The detail of the cat `view.detail` names, in the roster's place (ui-design 5.2), or
 * null for the roster: a heading, then the sections "now", "likes" and "family".
 */
export function detailScreen(
  world: WorldState,
  view: CatsView,
  selected: string | null,
  river: boolean,
) {
  const cat = world.cats.find((item) => item.id === view.detail);
  if (!cat) return null;
  const mood = moodBadge(cat.mood);
  const bond = bondBadge(cat.playerBond);
  const energy = cat.needs.energy;
  const known = knownTastes(
    pettingTastes(world.seed, cat.id),
    cat.petting.discovered,
  );
  const lines: Record<CatsSection, ReturnType<typeof line>[]> = {
    now: [
      line('心情', mood.text, mood.hint),
      line('亲密', `${bond.hearts} ${bond.name}`, bond.next, bond.progress),
      line('体力', `${energy}/${MAX_STAT}`, activity(cat), {
        value: energy,
        max: MAX_STAT,
      }),
    ],
    likes: [
      line(
        '喜欢的鱼',
        cat.favoriteFish.map((id) => fishById(id).name).join('、'),
      ),
      line('摸摸', known || PETTING_COPY.unknown),
      line('本领', CAT_BREEDS[cat.breedId].fishingHint),
    ],
    family: [
      line('父母', CATS_COPY.fromAfar),
      line('孩子', CATS_COPY.noKittens),
    ],
  };
  return {
    id: cat.id,
    portrait: catPortrait(
      lookOf(cat),
      pose(world, cat, markedId(world, selected), river),
    ),
    name: cat.name,
    sex: CATS_COPY.sex[cat.sex],
    about: [
      CAT_BREEDS[cat.breedId].name,
      CATS_COPY.generation(cat.generation),
      CAT_DEFINITIONS[cat.definitionId].personalityLabel,
    ].join(' · '),
    sections: CATS_SECTIONS.map((id) => ({
      id,
      title: CATS_COPY.sections[id],
      open: view.open.includes(id),
      lines: lines[id],
    })),
  };
}

/** Where the cat is: walking, on a shore, or about the city. */
function activity(cat: CatEntity) {
  return cat.walk
    ? `步行中 · 剩 ${cat.walk.route.length} 格`
    : cat.fishingSpotId
      ? `在${SPOTS[cat.fishingSpotId].name}岸边`
      : '在小城里';
}

/**
 * The selected cat's card on the chat page (spec 041 T-12): its name, mood, traits and
 * bond, or a greeting while no cat is selected. The reunion and bond lines speak of the
 * selected cat, else the first.
 */
export function talkCard(
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
