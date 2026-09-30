import { describe, expect, it } from 'vitest';
import { BOND_LEVELS } from '../../src/content/care';
import { fishById, SPOTS } from '../../src/content/fishing';
import { createWorld } from '../../src/core/world';
import { MAX_STAT, type CatEntity, type WorldState } from '../../src/core';
import { detailScreen, rosterScreen } from '../../src/view/cats/screen';
import { createCatsView, type CatsView } from '../../src/view/cats/view-state';
import { fullCity, invite } from '../helpers/world';

// Spec 041 T-12 (ui-design 5.1, 5.2): the cats panel's roster and a cat's detail.

const city = fullCity().getSnapshot();
const pair = (() => {
  const world = createWorld(42);
  invite(world);
  return world.getSnapshot();
})();
const [mochi, pepper] = pair.cats as [CatEntity, CatEntity];
const view = (fields: Partial<CatsView> = {}): CatsView => ({
  ...createCatsView().get(),
  ...fields,
});
const change = (world: WorldState, id: string, fields: Partial<CatEntity>) => ({
  ...world,
  cats: world.cats.map((cat) => (cat.id === id ? { ...cat, ...fields } : cat)),
});

describe('the roster (ui-design 5.1)', () => {
  it('has a row per cat in the order they came, up to the ten companions', () => {
    const rows = rosterScreen(city, null, false);
    expect(rows.map((row) => row.id)).toEqual(city.cats.map((cat) => cat.id));
    expect(rows).toHaveLength(10);
  });

  it('shows each cat’s name, sex, generation, mood, bond and energy', () => {
    const [row] = rosterScreen(pair, mochi.id, false);
    expect(row).toMatchObject({
      name: 'Mochi',
      sex: { mark: '♀', label: '母' },
      generation: '一代目',
      energy: `体力 ${mochi.needs.energy}`,
      energyValue: mochi.needs.energy,
      mood: { text: '😺 平静', label: '心情：平静' },
      bond: {
        text: '♡♡♡♡ 初识',
        label: `关系：初识，距「${BOND_LEVELS[1].name}」还差 ${BOND_LEVELS[1].bond}`,
      },
      details: 'Mochi 的详情',
    });
    expect(rosterScreen(pair, mochi.id, false)[1]!.sex).toEqual({
      mark: '♂',
      label: '公',
    });
  });

  it('names the generation as R-34 writes it', () => {
    const later = change(pair, mochi.id, { generation: 2 });
    expect(rosterScreen(later, null, false)[0]!.generation).toBe('二代目');
    const fifth = change(pair, mochi.id, { generation: 5 });
    expect(rosterScreen(fifth, null, false)[0]!.generation).toBe('五代目');
  });

  it('marks the selected cat, the one on the rod during a run, else the first', () => {
    const marked = (world: WorldState, selected: string | null) =>
      rosterScreen(world, selected, false)
        .filter((row) => row.pressed)
        .map((row) => row.id);
    expect(marked(pair, pepper.id)).toEqual([pepper.id]);
    expect(marked(pair, null)).toEqual([mochi.id]);
    expect(marked(pair, 'gone')).toEqual([mochi.id]);
    const fishing = createWorld(42);
    invite(fishing);
    const begun = fishing.dispatch({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      spotId: 'POND',
      baitId: 'BREAD',
      direction: 0,
      aimDepth: 50,
    });
    expect(begun.ok).toBe(true);
    const run = fishing.getSnapshot();
    expect(marked(run, pepper.id)).toEqual([mochi.id]);
    // A run holds the companion: no row picks another cat meanwhile.
    expect(
      rosterScreen(run, pepper.id, false).every((row) => row.disabled),
    ).toBe(true);
    expect(rosterScreen(pair, null, false).some((row) => row.disabled)).toBe(
      false,
    );
  });
});

describe('a cat’s detail (ui-design 5.2)', () => {
  const detail = (world: WorldState, fields: Partial<CatsView> = {}) =>
    detailScreen(world, view({ detail: mochi.id, ...fields }), null, false)!;

  it('shows the roster until a detail is opened, and again when its cat is gone', () => {
    expect(detailScreen(pair, view(), null, false)).toBeNull();
    expect(
      detailScreen(pair, view({ detail: 'gone' }), null, false),
    ).toBeNull();
    expect(detail(pair).id).toBe(mochi.id);
  });

  it('heads with the name, sex, breed, generation and personality', () => {
    expect(detail(pair)).toMatchObject({
      name: 'Mochi',
      sex: { mark: '♀', label: '母' },
      about: '布偶猫 · 一代目 · 胆小 · 贪吃 · 慢热',
    });
  });

  it('has the sections now, likes and family; "now" alone is open at first', () => {
    expect(
      detail(pair).sections.map(({ id, title, open }) => [id, title, open]),
    ).toEqual([
      ['now', '现在', true],
      ['likes', '喜好', false],
      ['family', '家人', false],
    ]);
    expect(
      detail(pair, { open: ['likes', 'family'] }).sections.map(
        (section) => section.open,
      ),
    ).toEqual([false, true, true]);
  });

  it('"now" gives the mood, the bond with the way to the next level, and the energy', () => {
    const now = detail(change(pair, mochi.id, { mood: 90, playerBond: 3 }))
      .sections[0]!.lines;
    const next = BOND_LEVELS[1];
    expect(now).toEqual([
      {
        label: '心情',
        text: '😸 开心',
        meter: null,
        note: '开心：遛鱼圈更大，经验更多',
      },
      {
        label: '亲密',
        text: '♡♡♡♡ 初识',
        meter: { value: 3, max: next.bond },
        note: `距「${next.name}」还差 ${next.bond - 3}`,
      },
      {
        label: '体力',
        text: `${mochi.needs.energy}/${MAX_STAT}`,
        meter: { value: mochi.needs.energy, max: MAX_STAT },
        // Mochi starts on the pond's shore.
        note: `在${SPOTS.POND.name}岸边`,
      },
    ]);
  });

  it('"likes" gives the fish it likes, the spots found by petting and its breed’s gift', () => {
    const likes = detail(pair).sections[1]!.lines.map(({ label, text }) => [
      label,
      text,
    ]);
    expect(likes).toEqual([
      [
        '喜欢的鱼',
        mochi.favoriteFish.map((id) => fishById(id).name).join('、'),
      ],
      ['摸摸', '还不知道'],
      ['本领', expect.any(String)],
    ]);
    expect(likes[2]![1]).not.toBe('');
  });

  it('"family" says where a first-generation cat came from, and that it has no kittens', () => {
    expect(
      detail(pair).sections[2]!.lines.map(({ label, text }) => [label, text]),
    ).toEqual([
      ['父母', '从别处来到小城'],
      ['孩子', '还没有孩子'],
    ]);
  });

  it('offers a new name beside the name: the box opens on it, shuffled by the cat’s id (R-16)', () => {
    expect(detail(pair).rename).toEqual({
      label: '给 Mochi 改名字',
      dialog: {
        title: '给 Mochi 改个名字',
        confirm: '就叫这个',
        initial: 'Mochi',
        salt: 0,
      },
    });
    const other = detailScreen(pair, view({ detail: pepper.id }), null, false)!;
    expect(other.rename.dialog).toMatchObject({
      initial: 'Pepper',
      salt: Number(pepper.id.slice('cat-'.length)),
    });
  });
});

describe('the cats panel’s view state', () => {
  it('opens a cat’s detail and goes back to the roster', () => {
    const store = createCatsView();
    expect(store.get().detail).toBeNull();
    store.dispatch({ type: 'detail', catId: 'mochi' });
    expect(store.get().detail).toBe('mochi');
    store.dispatch({ type: 'detail', catId: null });
    expect(store.get().detail).toBeNull();
  });

  it('opens and closes each section on its own; "now" starts open', () => {
    const store = createCatsView();
    expect(store.get().open).toEqual(['now']);
    store.dispatch({ type: 'section', section: 'family' });
    expect(store.get().open).toEqual(['now', 'family']);
    store.dispatch({ type: 'section', section: 'now' });
    expect(store.get().open).toEqual(['family']);
  });

  it('tells listeners only of changes', () => {
    const store = createCatsView();
    let heard = 0;
    store.subscribe(() => heard++);
    store.dispatch({ type: 'detail', catId: null });
    store.dispatch({ type: 'chatted', catId: '', note: '' });
    expect(heard).toBe(0);
    store.dispatch({ type: 'detail', catId: 'mochi' });
    expect(heard).toBe(1);
  });
});
