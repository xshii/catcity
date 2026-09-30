import { describe, expect, it } from 'vitest';
import { BOND_LEVELS } from '../../src/content/care';
import { personalityLabel } from '../../src/content/cats';
import { BREED_COOLDOWN_MINUTES } from '../../src/content/family';
import { suggestNames, World, type WorldState } from '../../src/core';
import {
  birthCard,
  breedScreen,
  kittenFlow,
} from '../../src/view/cats/breed-screen';
import { detailScreen } from '../../src/view/cats/screen';
import { PEPPER_ID, readyPair, withKitten } from '../helpers/family';

// Spec 041 T-22 (ui-design 4.2, 5.2, 5.4): the way to a kitten from the list of partners,
// what the confirmation and the name box say, the card of the birth, and the kitten's
// family in its detail. Decided by pure functions; the DOM only applies them.

const KITTEN = 'cat-3';

describe('the way to a kitten (T-22)', () => {
  it('asks first, then names the kitten by the id it will have', () => {
    const world = readyPair().getSnapshot();
    const flow = kittenFlow(world, 'mochi', PEPPER_ID);
    expect(flow.confirm).toEqual({
      title: 'Mochi 和 Pepper 要有小猫了',
      body: [
        '小猫会像爸爸妈妈，具体像谁，生下来才知道。',
        `之后 Mochi 和 Pepper 要休息 ${BREED_COOLDOWN_MINUTES / 1440} 天才能再生小猫。`,
      ],
      cost: '小猫要一张空床，也算一只伙伴猫（小城最多 10 只）。',
      confirm: '生小猫',
    });
    expect(flow.name).toEqual({
      title: '给小猫起个名字',
      confirm: '就叫这个',
      initial: suggestNames(world, world.nextId, 0)[0],
      salt: world.nextId,
      // The player names its sex too (user 2026-09-30).
      askSex: true,
    });
    expect(flow.command('团子', 'M')).toEqual({
      type: 'BREED_CATS',
      motherId: 'mochi',
      fatherId: PEPPER_ID,
      name: '团子',
      sex: 'M',
    });
  });

  it('names the queen the mother whichever of the two is selected', () => {
    const world = readyPair().getSnapshot();
    const flow = kittenFlow(world, PEPPER_ID, 'mochi');
    expect(flow.confirm.title).toBe('Mochi 和 Pepper 要有小猫了');
    expect(flow.command('团子', 'F')).toMatchObject({
      motherId: 'mochi',
      fatherId: PEPPER_ID,
    });
  });

  it('is offered under the partners who miss nothing', () => {
    const model = breedScreen(readyPair().getSnapshot(), 'mochi')!;
    expect(model.kitten).toBe('生小猫…');
    expect(model.partners).toEqual([
      expect.objectContaining({ ok: true, kitten: '和 Pepper 生小猫' }),
    ]);
  });
});

describe('the card of a birth (ui-design 5.4)', () => {
  /** The kitten's parents with looks changed: whose eyes and coat it has. */
  const card = (change: (state: WorldState) => void) => {
    const state = withKitten().getSnapshot();
    change(state);
    return birthCard(state, KITTEN);
  };
  const [mother, father, kitten] = withKitten().getSnapshot().cats;

  it('says who was born, where it sleeps and when it grows up', () => {
    const model = card(() => {});
    expect(model.title).toBe('团子 出生了');
    expect(model.about).toBe(
      `${kitten!.sex === 'F' ? '♀ 母' : '♂ 公'} · ${
        kitten!.breedId === 'RAGDOLL' ? '布偶猫' : '英短猫'
      } · 二代目`,
    );
    expect(model.home).toBe('它住进了 1 号公寓。');
    expect(model.grows).toBe('再过 2 天就长大了。');
    expect(model.see).toBe('看看它');
    // Parents at 信任 pass no family marks: no talent to tell of.
    expect(model.talent).toBe('');
    expect(model.portrait).toContain('<svg');
  });

  it('tells whose eyes and coat the kitten has', () => {
    const set = (
      state: WorldState,
      id: string,
      eyes: 'blue' | 'green' | 'copper',
      colour: 'cream' | 'black' | 'gray',
    ) => {
      const cat = state.cats.find((item) => item.id === id)!;
      cat.appearance = { ...cat.appearance, eyes, colour };
    };
    const like = (
      kittenLook: ['blue' | 'green', 'cream' | 'black'],
      both = false,
    ) =>
      card((state) => {
        set(state, mother!.id, 'blue', 'cream');
        set(state, father!.id, both ? 'blue' : 'green', 'black');
        set(state, KITTEN, ...kittenLook);
      }).resemblance;
    expect(like(['blue', 'cream'])).toBe('眼睛和毛色都像妈妈');
    expect(like(['green', 'black'])).toBe('眼睛和毛色都像爸爸');
    expect(like(['blue', 'black'])).toBe('眼睛像妈妈，毛色像爸爸');
    expect(like(['green', 'cream'])).toBe('眼睛像爸爸，毛色像妈妈');
    expect(like(['blue', 'black'], true)).toBe('眼睛像爸爸妈妈，毛色像爸爸');
  });

  it('tells the talents a kitten of a family with marks was born with', () => {
    const state = readyPair().getSnapshot();
    state.cats[0]!.playerBond = BOND_LEVELS[4].bond;
    state.cats[1]!.playerBond = BOND_LEVELS[3].bond;
    const world = new World(state);
    world.dispatch({
      type: 'BREED_CATS',
      motherId: 'mochi',
      fatherId: PEPPER_ID,
      name: '团子',
      sex: 'F',
    });
    expect(birthCard(world.getSnapshot(), KITTEN).talent).toBe(
      '钓感 1 · 耐力 1 · 亲人 1',
    );
  });
});

describe('a kitten and its parents in the detail (R-34, R-35)', () => {
  const family = (catId: string) =>
    detailScreen(
      withKitten().getSnapshot(),
      { news: { catId: '', note: '' }, detail: catId, open: ['family'] },
      catId,
      false,
    )!;
  const lines = (catId: string, section: number) =>
    Object.fromEntries(
      family(catId).sections[section]!.lines.map(({ label, text }) => [
        label,
        text,
      ]),
    );

  it('names the kitten’s parents and its generation, and the parents’ kitten', () => {
    expect(family(KITTEN).about).toContain('二代目');
    expect(lines(KITTEN, 2)).toMatchObject({
      父母: '妈妈 Mochi · 爸爸 Pepper',
      孩子: '还没有孩子',
      家传: '这一脉 0 枚 · 它自己 0 枚',
    });
    expect(lines('mochi', 2)).toMatchObject({
      父母: '从别处来到小城',
      孩子: '团子',
    });
    expect(lines(PEPPER_ID, 2)['孩子']).toBe('团子');
  });

  it('gives the kitten’s own personality words and talents', () => {
    const kitten = withKitten().getSnapshot().cats[2]!;
    // One word of each parent's, as the player reads them.
    expect(
      family(KITTEN).about.endsWith(personalityLabel(kitten.personality)),
    ).toBe(true);
    expect(kitten.personality).toHaveLength(2);
    expect(lines(KITTEN, 1)['天赋']).toBe('钓感 0 · 耐力 0 · 亲人 0');
  });
});
