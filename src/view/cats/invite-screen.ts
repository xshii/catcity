import { CAT_BREEDS } from '../../content/breeds';
import {
  CAT_DEFINITIONS,
  INVITABLE_CATS,
  MAX_COMPANIONS,
  personalityLabel,
  type CatDefinitionId,
} from '../../content/cats';
import { fishById } from '../../content/fishing';
import { catLook } from '../art/cat-look';
import {
  freeBeds,
  nextInvitePrice,
  type CheckResult,
  type GameCommand,
  type WorldState,
} from '../../core';
import { ERROR_MESSAGES } from '../common/errors';

/** Words of the invite list (ui-design 5.3). */
export const INVITE_COPY = {
  entry: '邀请新伙伴',
  left: (count: number) => `（还能邀请 ${count} 只）`,
  back: '‹ 名册',
  backLabel: '回到名册',
  title: '邀请新伙伴',
  beds: (count: number) => `新伙伴需要一张空床。现有空床：${count}`,
  allHere: '名单上的猫都来到小城了。',
  invite: (price: number) => `邀请 · ${price} 金币`,
  likes: (fish: string) => `喜欢：${fish}`,
  short: (price: number, coins: number) =>
    `金币不足：需要 ${price}，现有 ${coins}。`,
  arrived: (name: string, apartment: number) =>
    `${name} 来到了小城，住进了 ${apartment} 号公寓。`,
} as const;
/** Sex as a symbol, and the word a screen reader says (ui-design 2.2: no colours). */
const SEX = {
  F: { symbol: '♀', word: '母' },
  M: { symbol: '♂', word: '公' },
} as const;

/** Who a cat on the list is; it never changes, so its card is drawn once. */
export function inviteCard(id: CatDefinitionId) {
  const cat = CAT_DEFINITIONS[id];
  return {
    name: cat.name,
    look: catLook(cat.breedId, cat.appearance),
    sex: SEX[cat.sex],
    breed: CAT_BREEDS[cat.breedId].name,
    personality: personalityLabel(cat.personality),
    likes: INVITE_COPY.likes(
      cat.favoriteFish.map((fish) => fishById(fish).name).join('、'),
    ),
    hint: CAT_BREEDS[cat.breedId].fishingHint,
  };
}

const waiting = (world: WorldState) =>
  INVITABLE_CATS.filter(
    (id) => !world.cats.some((cat) => cat.definitionId === id),
  );

/** The way in under the roster, with how many more cats may still come. */
export function inviteEntry(world: WorldState): string {
  const left = Math.min(
    waiting(world).length,
    Math.max(0, MAX_COMPANIONS - world.cats.length),
  );
  return INVITE_COPY.entry + (left ? INVITE_COPY.left(left) : '');
}

/**
 * The cats not in the city yet, each at the same price (it depends only on how many came
 * before), and why Core would turn one away: `check` is a dry run of the command.
 */
export function inviteScreen(
  world: WorldState,
  check: (command: GameCommand) => CheckResult,
) {
  const price = nextInvitePrice(world);
  const cats = waiting(world).map((id) => {
    const result = check({ type: 'INVITE_CAT', definitionId: id });
    return {
      id,
      button: INVITE_COPY.invite(price),
      disabled: !result.ok,
      reason: result.ok
        ? null
        : result.error === 'INSUFFICIENT_COINS'
          ? INVITE_COPY.short(price, world.coins)
          : ERROR_MESSAGES[result.error],
    };
  });
  return {
    beds: INVITE_COPY.beds(freeBeds(world).length),
    allHere: !cats.length,
    cats,
  };
}

/** An apartment's number: apartments are numbered in the order they were built. */
export const apartmentNumber = (world: WorldState, id: string): number =>
  world.buildings
    .filter((building) => building.type === 'CAT_APARTMENT')
    .findIndex((building) => building.id === id) + 1;

/** Where the newcomer moved in. */
export function arrivedNotice(world: WorldState, catId: string): string {
  const cat = world.cats.find((item) => item.id === catId)!;
  return INVITE_COPY.arrived(cat.name, apartmentNumber(world, cat.home!));
}
