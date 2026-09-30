import { CAT_BREEDS } from '../../content/breeds';
import { BOND_LEVELS } from '../../content/care';
import { MAX_COMPANIONS } from '../../content/cats';
import {
  BREED_BOND_LEVEL,
  BREED_COOLDOWN_MINUTES,
  KITTEN_MINUTES,
  TALENT_NAMES,
} from '../../content/family';
import { moodBand } from '../../content/mood';
import {
  catBreedBlocks,
  cityBreedBlocks,
  pairBreedBlocks,
  suggestNames,
  type BreedBlock,
  type CatEntity,
  type GameCommand,
  type WorldState,
} from '../../core';
import { catLook, type CatPose } from '../art/cat-look';
import { catPortrait } from '../art/illustrations';
import type { ConfirmContent } from '../common/confirm';
import { MOOD_COPY } from '../common/mood';
import { apartmentNumber } from './invite-screen';
import type { NameDialogInput } from './name-dialog-screen';
import { CATS_COPY, talentText } from './screen';

/** What the words of one condition need to know: the cat it is about and the other one. */
interface Facts {
  name: string;
  other: string;
  mood: string;
  rest: string;
}

/** Player-facing words of "who could it have a kitten with" (ui-design 4.3, 5.4). */
const BREED_COPY = {
  open: (name: string) => `${name} 和谁生小猫…`,
  ok: '✓ 可以',
  no: '✗',
  alone: '小城里还没有别的猫。',
  self: (name: string) => `${name} 自己：`,
  city: '全城：',
  sex: {
    F: { mark: '♀', label: '母' },
    M: { mark: '♂', label: '公' },
  } satisfies Record<CatEntity['sex'], { mark: string; label: string }>,
  /** What is missing, then what to do about it. */
  blocks: {
    SAME_CAT: () => '不能和自己生小猫',
    NEED_PAIR: () => '需要一公一母',
    KITTEN: ({ name }) => `${name} 还小：长大后才可以`,
    NEUTERED: ({ name }) => `${name} 已经绝育了`,
    NOT_HAPPY: ({ name, mood }) =>
      `${name} 现在不够开心（${mood}）：摸摸它，或者送它喜欢的鱼`,
    BOND_TOO_LOW: ({ name }) =>
      `和 ${name} 的亲密还没到「${BOND_LEVELS[BREED_BOND_LEVEL].name}」：一起钓鱼、聊天、摸摸它`,
    RELATED: ({ name, other }) => `${name} 和 ${other} 是一家人`,
    COOLING_DOWN: ({ name, rest }) => `${name} 还在休息：${rest}后可以再生小猫`,
    NO_BED: () => '没有空床位：先建一座猫公寓',
    COMPANION_LIMIT: () => `伙伴猫已经有 ${MAX_COMPANIONS} 只了，住不下更多`,
  } satisfies Record<BreedBlock, (facts: Facts) => string>,
  days: (days: number) => `${days} 天`,
  hours: (hours: number) => `${hours} 小时`,
  /** The way to a kitten under a partner who misses nothing (T-22). */
  kitten: {
    button: '生小猫…',
    label: (other: string) => `和 ${other} 生小猫`,
  },
} as const;

/**
 * Words of having a kitten (spec 041 T-22, ui-design 4.2 and 5.4): the confirmation, the
 * name box that follows it, and the card of the birth.
 */
const KITTEN_COPY = {
  title: (mother: string, father: string) =>
    `${mother} 和 ${father} 要有小猫了`,
  unknown: '小猫会像爸爸妈妈，具体像谁，生下来才知道。',
  rest: (mother: string, father: string, days: number) =>
    `之后 ${mother} 和 ${father} 要休息 ${days} 天才能再生小猫。`,
  room: `小猫要一张空床，也算一只伙伴猫（小城最多 ${MAX_COMPANIONS} 只）。`,
  confirm: '生小猫',
  name: { title: '给小猫起个名字', confirm: '就叫这个' },
  born: (name: string) => `${name} 出生了`,
  looks: {
    eyes: '眼睛',
    colour: '毛色',
  },
  like: { mother: '像妈妈', father: '像爸爸', both: '像爸爸妈妈' },
  home: (apartment: number) => `它住进了 ${apartment} 号公寓。`,
  grows: (days: number) => `再过 ${days} 天就长大了。`,
  see: '看看它',
} as const;

/** How long the cat still rests after its last kitten, in whole days or, within a day, hours. */
function restLeft(world: WorldState, cat: CatEntity): string {
  if (cat.lastBredMinute === null) return '';
  const left = cat.lastBredMinute + BREED_COOLDOWN_MINUTES - world.minute;
  return left >= 1440
    ? BREED_COPY.days(Math.ceil(left / 1440))
    : BREED_COPY.hours(Math.ceil(left / 60));
}

/**
 * The list under the selected cat (spec 041 T-21): every other cat with the conditions it
 * misses, then the selected cat's own and the city's, once each. The rules are Core's
 * `breedBlocks`, split by whom they are about; null without a selected cat.
 */
export function breedScreen(world: WorldState, selected: string | null) {
  const self = world.cats.find((cat) => cat.id === selected);
  if (!self) return null;
  const lines = (blocks: BreedBlock[], cat: CatEntity) =>
    blocks.map(
      (block) =>
        `${BREED_COPY.no} ${BREED_COPY.blocks[block]({
          name: cat.name,
          other: self.name,
          mood: MOOD_COPY.bands[moodBand(cat.mood)].label,
          rest: restLeft(world, cat),
        })}`,
    );
  const partners = world.cats
    .filter((cat) => cat.id !== self.id)
    .map((cat) => {
      const missing = lines(
        [...pairBreedBlocks(world, self, cat), ...catBreedBlocks(world, cat)],
        cat,
      );
      return {
        id: cat.id,
        name: cat.name,
        sex: BREED_COPY.sex[cat.sex],
        ok: !missing.length,
        lines: missing.length ? missing : [BREED_COPY.ok],
        kitten: BREED_COPY.kitten.label(cat.name),
      };
    });
  return {
    open: BREED_COPY.open(self.name),
    /** The way to a kitten, on the rows of partners who miss nothing. */
    kitten: BREED_COPY.kitten.button,
    partners,
    alone: partners.length ? '' : BREED_COPY.alone,
    self: {
      heading: BREED_COPY.self(self.name),
      lines: lines(catBreedBlocks(world, self), self),
    },
    city: {
      heading: BREED_COPY.city,
      lines: lines(cityBreedBlocks(world), self),
    },
  };
}

/** The two as a queen and a tom, whichever of them is selected. */
const asParents = (world: WorldState, a: string, b: string) => {
  const [first, second] = [a, b].map((id) =>
    world.cats.find((cat) => cat.id === id)!,
  ) as [CatEntity, CatEntity];
  return first.sex === 'F'
    ? { mother: first, father: second }
    : { mother: second, father: first };
};

/**
 * Having a kitten with `partnerId` (spec 041 R-32, T-22): the confirmation first
 * (ui-design 4.2), then the name box, which suggests by the id the kitten will have;
 * `command` is what the chosen name sends. Nothing is drawn or allocated before that.
 */
export function kittenFlow(
  world: WorldState,
  selfId: string,
  partnerId: string,
) {
  const { mother, father } = asParents(world, selfId, partnerId);
  const salt = world.nextId;
  return {
    confirm: {
      title: KITTEN_COPY.title(mother.name, father.name),
      body: [
        KITTEN_COPY.unknown,
        KITTEN_COPY.rest(
          mother.name,
          father.name,
          BREED_COOLDOWN_MINUTES / 1440,
        ),
      ],
      cost: KITTEN_COPY.room,
      confirm: KITTEN_COPY.confirm,
    } satisfies ConfirmContent,
    name: {
      title: KITTEN_COPY.name.title,
      confirm: KITTEN_COPY.name.confirm,
      initial: suggestNames(world, salt, 0)[0]!,
      salt,
    } satisfies NameDialogInput,
    command: (name: string): GameCommand => ({
      type: 'BREED_CATS',
      motherId: mother.id,
      fatherId: father.id,
      name,
    }),
  };
}

type Side = keyof typeof KITTEN_COPY.like;
/** A newborn is drawn calm and awake. */
const NEWBORN: CatPose = { face: 'calm', ears: 'up', curled: false };

/**
 * The card of a birth (ui-design 4.1 level 5, 5.4): the kitten, whom its eyes and coat
 * take after, the talents it was born with, its bed, and when it grows up.
 */
export function birthCard(world: WorldState, kittenId: string) {
  const kitten = world.cats.find((cat) => cat.id === kittenId)!;
  const mother = world.cats.find((cat) => cat.id === kitten.parents!.mother)!;
  const father = world.cats.find((cat) => cat.id === kitten.parents!.father)!;
  /** Whose eyes or coat it has; one both parents share is theirs. */
  const side = (item: keyof typeof KITTEN_COPY.looks): Side =>
    mother.appearance[item] === father.appearance[item]
      ? 'both'
      : kitten.appearance[item] === mother.appearance[item]
        ? 'mother'
        : 'father';
  const [eyes, colour] = [side('eyes'), side('colour')];
  const { looks, like } = KITTEN_COPY;
  const resemblance =
    eyes === colour
      ? `${looks.eyes}和${looks.colour}都${like[eyes]}`
      : `${looks.eyes}${like[eyes]}，${looks.colour}${like[colour]}`;
  const gifted = TALENT_NAMES.some((name) => kitten.talent[name] > 0);
  return {
    portrait: catPortrait(catLook(kitten.breedId, kitten.appearance), NEWBORN),
    title: KITTEN_COPY.born(kitten.name),
    about: [
      `${CATS_COPY.sex[kitten.sex].mark} ${CATS_COPY.sex[kitten.sex].label}`,
      CAT_BREEDS[kitten.breedId].name,
      CATS_COPY.generation(kitten.generation),
    ].join(' · '),
    resemblance,
    talent: gifted ? talentText(kitten.talent) : '',
    home: KITTEN_COPY.home(apartmentNumber(world, kitten.home!)),
    grows: KITTEN_COPY.grows(KITTEN_MINUTES / 1440),
    see: KITTEN_COPY.see,
  };
}
