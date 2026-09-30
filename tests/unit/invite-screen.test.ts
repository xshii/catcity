import { describe, expect, it } from 'vitest';
import { INVITABLE_CATS, MAX_COMPANIONS } from '../../src/content/cats';
import { createWorld, World } from '../../src/core';
import {
  arrivedNotice,
  inviteCard,
  inviteEntry,
  inviteScreen,
} from '../../src/view/cats/invite-screen';
import { catLook, COAT_APPEARANCE } from '../../src/view/art/cat-look';
import { ERROR_MESSAGES } from '../../src/view/common/errors';

// ui-design 5.3: the list of cats to invite, as the page shows it.

/** A new game with `apartments` apartments built and then `coins` coins. */
const game = (apartments: number, coins = 100_000) => {
  const world = new World({ ...createWorld(42).getSnapshot(), coins: 5000 });
  for (const position of [
    { x: 4, y: 3 },
    { x: 6, y: 3 },
    { x: 3, y: 4 },
  ].slice(0, apartments))
    expect(
      world.dispatch({
        type: 'BUILD_BUILDING',
        buildingType: 'CAT_APARTMENT',
        position,
      }).ok,
    ).toBe(true);
  return new World({ ...world.getSnapshot(), coins });
};
const screen = (world: World) =>
  inviteScreen(world.getSnapshot(), (command) => world.check(command));
const invite = (world: World, definitionId: string) =>
  expect(world.dispatch({ type: 'INVITE_CAT', definitionId }).ok).toBe(true);
/** Mochi and `count` copies of her from the debug bridge, on grass south of the city. */
const crowded = (count: number) => {
  const world = game(1);
  const grass = [2, 3, 4, 5, 6, 7].flatMap((x) => [
    { x, y: 7 },
    { x, y: 8 },
  ]);
  for (const position of grass.slice(0, count))
    expect(world.dispatch({ type: 'DEBUG_SPAWN_CAT', position }).ok).toBe(true);
  return world;
};

describe('the invite list (ui-design 5.3)', () => {
  it('shows who each cat is: sex in words, breed, personality, favourite fish, what its breed draws', () => {
    expect(inviteCard('DOUBAO')).toEqual({
      name: '豆包',
      look: catLook('BRITISH_SHORTHAIR', COAT_APPEARANCE.orange),
      sex: { symbol: '♂', word: '公' },
      breed: '英短猫',
      personality: '随和 · 懒洋洋',
      likes: '喜欢：海鲷、月光鲤',
      hint: '能吸引 5 星月光鲤',
    });
    expect(inviteCard('NIANGAO')).toMatchObject({
      sex: { symbol: '♀', word: '母' },
      breed: '布偶猫',
      likes: '喜欢：鲭鱼、锦鲤',
    });
  });

  it('the way in says how many more may come', () => {
    expect(inviteEntry(createWorld(42).getSnapshot())).toBe(
      `邀请新伙伴（还能邀请 ${INVITABLE_CATS.length} 只）`,
    );
    // One cat short of the limit: one place left.
    expect(inviteEntry(crowded(MAX_COMPANIONS - 2).getSnapshot())).toBe(
      '邀请新伙伴（还能邀请 1 只）',
    );
    const everyone = game(3);
    for (const id of INVITABLE_CATS) invite(everyone, id);
    expect(inviteEntry(everyone.getSnapshot())).toBe('邀请新伙伴');
  });

  it('offers every cat not in the city yet, all at the same price, and counts the free beds', () => {
    const world = game(1);
    const first = screen(world);
    expect(first.beds).toBe('新伙伴需要一张空床。现有空床：2');
    expect(first.allHere).toBe(false);
    expect(first.cats).toEqual(
      INVITABLE_CATS.map((id) => ({
        id,
        button: '邀请 · 200 金币',
        disabled: false,
        reason: null,
      })),
    );
    invite(world, 'PEPPER');
    const second = screen(world);
    expect(second.beds).toBe('新伙伴需要一张空床。现有空床：1');
    expect(second.cats.map((cat) => cat.id)).toEqual(
      INVITABLE_CATS.filter((id) => id !== 'PEPPER'),
    );
    expect(new Set(second.cats.map((cat) => cat.button))).toEqual(
      new Set(['邀请 · 400 金币']),
    );
  });

  it('says what is missing and what to do when a cat cannot come', () => {
    const reasons = (world: World) =>
      new Set(
        screen(world).cats.map((cat) => [cat.disabled, cat.reason].join()),
      );
    expect(reasons(game(0))).toEqual(
      new Set([`true,${ERROR_MESSAGES.NO_BED}`]),
    );
    expect(ERROR_MESSAGES.NO_BED).toBe('没有空床位：先建一座公寓。');
    expect(reasons(game(1, 150))).toEqual(
      new Set(['true,金币不足：需要 200，现有 150。']),
    );
    expect(reasons(crowded(MAX_COMPANIONS - 1))).toEqual(
      new Set([`true,${ERROR_MESSAGES.COMPANION_LIMIT}`]),
    );
    expect(ERROR_MESSAGES.COMPANION_LIMIT).toContain(String(MAX_COMPANIONS));
  });

  it('says when everyone on the list has come', () => {
    const world = game(3);
    for (const id of INVITABLE_CATS) invite(world, id);
    expect(screen(world)).toMatchObject({ allHere: true, cats: [] });
  });

  it('tells where the newcomer moved in, by the apartments in the order built', () => {
    const world = game(2);
    for (const id of ['PEPPER', 'NIANGAO', 'DOUBAO']) invite(world, id);
    const [, pepper, , doubao] = world.getSnapshot().cats;
    expect(arrivedNotice(world.getSnapshot(), pepper!.id)).toBe(
      'Pepper 来到了小城，住进了 1 号公寓。',
    );
    expect(arrivedNotice(world.getSnapshot(), doubao!.id)).toBe(
      '豆包 来到了小城，住进了 2 号公寓。',
    );
  });
});
