import { describe, expect, it } from 'vitest';
import { MAX_COMPANIONS } from '../../src/content/cats';
import {
  BREED_COOLDOWN_MINUTES,
  KITTEN_MINUTES,
} from '../../src/content/family';
import { MOOD } from '../../src/content/mood';
import type { CatEntity, WorldState } from '../../src/core';
import { breedScreen } from '../../src/view/cats/breed-screen';
import { readyPair } from '../helpers/family';

// Worlds built here, as in breed-check.test.ts: not validated saves.
const ready: WorldState = {
  ...readyPair().getSnapshot(),
  minute: 10 * 1440,
};
const [mochi, pepper] = ready.cats as [CatEntity, CatEntity];
const change = (
  fields: Partial<CatEntity>,
  id = pepper.id,
  world = ready,
): WorldState => ({
  ...world,
  cats: world.cats.map((cat) => (cat.id === id ? { ...cat, ...fields } : cat)),
});
const screen = (world: WorldState) => breedScreen(world, mochi.id)!;
/** The lines under Pepper's row when only `fields` of Pepper differ. */
const pepperLines = (fields: Partial<CatEntity>) =>
  screen(change(fields)).partners[0]!.lines;

describe('who a cat could have a kitten with (spec 041 T-21, ui-design 5.4)', () => {
  it('lists every other cat with its sex, and says yes when nothing is missing', () => {
    const model = screen(ready);
    expect(model.open).toBe('Mochi 和谁生小猫…');
    expect(model.partners).toEqual([
      {
        id: pepper.id,
        name: 'Pepper',
        sex: { mark: '♂', label: '公' },
        ok: true,
        lines: ['✓ 可以'],
        kitten: '和 Pepper 生小猫',
      },
    ]);
    expect(model.alone).toBe('');
    expect(model.self.lines).toEqual([]);
    expect(model.city.lines).toEqual([]);
  });

  it('lists under a cat each condition it misses, with what to do', () => {
    const lines = pepperLines({ mood: MOOD.happy - 1, playerBond: 0 });
    expect(lines).toEqual([
      '✗ Pepper 现在不够开心（平静）：摸摸它，或者送它喜欢的鱼',
      '✗ 和 Pepper 的亲密还没到「信任」：一起钓鱼、聊天、摸摸它',
    ]);
    expect(screen(change({ mood: 0 })).partners[0]!.ok).toBe(false);
  });

  it.each<[string, Partial<CatEntity>, string]>([
    ['a pair', { sex: 'F' }, '✗ 需要一公一母'],
    [
      'a grown cat',
      { bornMinute: ready.minute - KITTEN_MINUTES + 1 },
      '✗ Pepper 还小：长大后才可以',
    ],
    ['a cat that can', { neutered: true }, '✗ Pepper 已经绝育了'],
    [
      'no family',
      { parents: { mother: mochi.id, father: 'cat-9' } },
      '✗ Pepper 和 Mochi 是一家人',
    ],
    [
      'a rested cat',
      { lastBredMinute: ready.minute - 1 },
      '✗ Pepper 还在休息：3 天后可以再生小猫',
    ],
    [
      'a cat rested within the day',
      { lastBredMinute: ready.minute - BREED_COOLDOWN_MINUTES + 61 },
      '✗ Pepper 还在休息：2 小时后可以再生小猫',
    ],
  ])('says so when it takes %s', (_, fields, line) => {
    expect(pepperLines(fields)).toEqual([line]);
  });

  it('says what the selected cat and the city miss once, not under every cat', () => {
    const world = change({ mood: 0 }, mochi.id, { ...ready, buildings: [] });
    const model = screen(world);
    expect(model.partners[0]!.lines).toEqual(['✓ 可以']);
    expect(model.self).toEqual({
      heading: 'Mochi 自己：',
      lines: ['✗ Mochi 现在不够开心（低落）：摸摸它，或者送它喜欢的鱼'],
    });
    expect(model.city).toEqual({
      heading: '全城：',
      lines: ['✗ 没有空床位：先建一座猫公寓'],
    });
  });

  it('says when the city has all the cats it can', () => {
    const full = {
      ...ready,
      cats: [
        ...ready.cats,
        ...Array.from({ length: MAX_COMPANIONS - 2 }, (_, index) => ({
          ...mochi,
          id: `cat-${100 + index}`,
        })),
      ],
    };
    const model = screen(full);
    expect(model.city.lines).toEqual([
      `✗ 伙伴猫已经有 ${MAX_COMPANIONS} 只了，住不下更多`,
    ]);
    expect(model.partners.map((partner) => partner.lines[0])).toEqual([
      '✓ 可以',
      ...Array.from({ length: MAX_COMPANIONS - 2 }, () => '✗ 需要一公一母'),
    ]);
  });

  it('says so when there is no other cat, and shows nothing without a selection', () => {
    const alone = { ...ready, cats: [mochi] };
    expect(screen(alone).partners).toEqual([]);
    expect(screen(alone).alone).toBe('小城里还没有别的猫。');
    expect(breedScreen(ready, null)).toBeNull();
  });
});
