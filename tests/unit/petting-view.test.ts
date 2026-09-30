import { describe, expect, it } from 'vitest';
import { PETTING, PET_SPOTS, type PetSpot } from '../../src/content/petting';
import { RandomService } from '../../src/core/random';
import { playPetting, stepPetting } from '../../src/minigames/petting';
import type { CatPose } from '../../src/view/art/cat-look';
import { reduceStroke, STROKE_TRAVEL_PX } from '../../src/view/petting/gesture';
import {
  knownTastes,
  pettingBondLeft,
  pettingEntry,
  pettingScreen,
  reactionLine,
} from '../../src/view/petting/screen';
import { BOND, CARE } from '../../src/content/care';
import {
  closedPetting,
  pettingPhase,
  reducePettingView,
  type PettingView,
  type PettingViewEvent,
} from '../../src/view/petting/view-state';

const TASTES = { favourite: 'CHIN', disliked: 'BELLY' } as const;
const MOCHI = {
  name: 'Mochi',
  definitionId: 'MOCHI',
  petting: { discovered: [] as PetSpot[], lifted: [] as number[] },
} as const;
const REST: CatPose = { face: 'calm', ears: 'up', curled: false };

const after = (events: PettingViewEvent[], view = closedPetting()) =>
  events.reduce(reducePettingView, view);
const open: PettingViewEvent = { type: 'open', catId: 'mochi', tastes: TASTES };
const ticks = (count: number): PettingViewEvent[] =>
  Array.from({ length: count }, () => ({ type: 'tick', ticks: 1 }));
const stroke = (spot: PetSpot): PettingViewEvent => ({ type: 'stroke', spot });
const RESULT = {
  spot: 'CHIN',
  meter: 80,
  mood: 6,
  full: true,
  note: '',
  moodAfter: 66,
  bond: 2,
  bondLeft: 2,
} as const;
const screenOf = (view: PettingView, cat: typeof MOCHI | null = MOCHI) => {
  const screen = pettingScreen(view, cat, REST);
  if (!screen.open) throw new Error('The screen is closed');
  return screen;
};

describe('petting view state', () => {
  it('is closed until a cat is petted, and a round starts empty', () => {
    expect(pettingPhase(closedPetting())).toBe('closed');
    const view = after([open]);
    expect(pettingPhase(view)).toBe('playing');
    expect(view).toMatchObject({ catId: 'mochi', strokes: [], result: null });
    expect(view.round).toMatchObject({ tick: 0, meter: 0, tastes: TASTES });
  });

  it('ignores ticks and strokes while closed', () => {
    const closed = closedPetting();
    expect(after([{ type: 'tick', ticks: 1 }, stroke('CHIN')], closed)).toBe(
      closed,
    );
  });

  it('records the strokes the cat took at the tick they landed', () => {
    const view = after([
      open,
      ...ticks(3),
      stroke('CHIN'),
      ...ticks(30),
      stroke('HEAD'),
    ]);
    expect(view.strokes).toEqual([
      { tick: 3, spot: 'CHIN' },
      { tick: 33, spot: 'HEAD' },
    ]);
    expect(view.focus).toBe('HEAD');
  });

  it('leaves out a stroke the cat did not take', () => {
    const away = after([open, stroke('BELLY'), ...ticks(5)]);
    expect(after([stroke('CHIN')], away)).toBe(away);
    expect(away.strokes).toEqual([{ tick: 0, spot: 'BELLY' }]);
  });

  it('waits for Core once the round ran out, then shows what Core made of it', () => {
    const ended = after([open, stroke('CHIN'), ...ticks(PETTING.roundTicks)]);
    expect(pettingPhase(ended)).toBe('settling');
    expect(after([{ type: 'tick', ticks: 1 }, stroke('CHIN')], ended)).toBe(
      ended,
    );
    const settled = after([{ type: 'settled', result: RESULT }], ended);
    expect(pettingPhase(settled)).toBe('result');
    expect(settled.result).toEqual(RESULT);
  });

  it('takes no result for a round still going', () => {
    const playing = after([open, stroke('CHIN')]);
    expect(after([{ type: 'settled', result: RESULT }], playing)).toBe(playing);
  });

  it.each([
    ['closing', { type: 'close' }],
    ['the page going to the background', { type: 'page', hidden: true }],
  ] as const)('ends a round with nothing kept on %s', (_, event) => {
    const playing = after([open, ...ticks(40), stroke('CHIN')]);
    const closed = after([event], playing);
    expect(pettingPhase(closed)).toBe('closed');
    expect(closed).toMatchObject({ round: null, strokes: [], result: null });
    expect(after([{ type: 'page', hidden: false }], playing)).toBe(playing);
  });

  it('starts over from nothing when opened again', () => {
    const settled = after([
      open,
      stroke('CHIN'),
      ...ticks(PETTING.roundTicks),
      { type: 'settled', result: RESULT },
    ]);
    const again = after([open], settled);
    expect(again).toMatchObject({ strokes: [], result: null });
    expect(again.round).toMatchObject({ tick: 0, meter: 0 });
  });

  it('moves the keyboard along the bar of spots, round from either end', () => {
    const focus = (
      ...keys: ('ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown')[]
    ) =>
      after([open, ...keys.map((key) => ({ type: 'arrow', key }) as const)])
        .focus;
    expect(focus()).toBe(PET_SPOTS[0]);
    expect(
      PET_SPOTS.map((_, moves) =>
        focus(...Array.from({ length: moves }, () => 'ArrowRight' as const)),
      ),
    ).toEqual([...PET_SPOTS]);
    expect(focus('ArrowDown')).toBe(PET_SPOTS[1]);
    expect(focus('ArrowLeft')).toBe(PET_SPOTS.at(-1));
    expect(focus('ArrowUp')).toBe(PET_SPOTS.at(-1));
    expect(focus('ArrowRight', 'ArrowLeft')).toBe(PET_SPOTS[0]);
  });

  it('holds the round under the settings sheet: no time passes, no stroke lands, then it goes on', () => {
    const settings = (open: boolean): PettingViewEvent => ({
      type: 'settings',
      open,
    });
    const going = after([open, ...ticks(10)]);
    const held = after([settings(true), ...ticks(40), stroke('CHIN')], going);
    expect(held.settingsOpen).toBe(true);
    expect(held.round).toBe(going.round);
    expect(held.strokes).toEqual([]);
    // Closed, it goes on from the tick where it stopped: the countdown and the purr.
    const resumed = after([settings(false), ...ticks(2), stroke('CHIN')], held);
    expect(resumed.round!.tick).toBe(12);
    expect(resumed.strokes).toEqual([{ tick: 12, spot: 'CHIN' }]);
    // The sheet follows the shell whatever the screen does: opened before a round too.
    expect(after([settings(true), open]).settingsOpen).toBe(true);
    expect(after([settings(true), open, { type: 'close' }]).settingsOpen).toBe(
      true,
    );
  });

  it('keeps its invariants under random events: Core will replay the very round shown', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = new RandomService(seed);
      let view = closedPetting();
      for (let step = 0; step < 600; step++) {
        const roll = rng.nextInt(100);
        const event: PettingViewEvent =
          roll < 70
            ? { type: 'tick', ticks: 1 + rng.nextInt(3) }
            : roll < 90
              ? stroke(PET_SPOTS[rng.nextInt(PET_SPOTS.length)]!)
              : roll < 93
                ? open
                : roll < 95
                  ? { type: 'close' }
                  : roll < 97
                    ? { type: 'settled', result: RESULT }
                    : roll < 98
                      ? { type: 'page', hidden: rng.nextInt(2) === 0 }
                      : roll < 99
                        ? { type: 'settings', open: rng.nextInt(2) === 0 }
                        : { type: 'arrow', key: 'ArrowDown' };
        const before = view;
        view = reducePettingView(view, event);
        // Under the settings sheet the round stands still.
        if (
          before.settingsOpen &&
          (event.type === 'tick' || event.type === 'stroke')
        )
          expect(view).toBe(before);
        const phase = pettingPhase(view);
        const where = `seed ${seed} step ${step}`;
        if (phase === 'closed') {
          expect(view, where).toMatchObject({
            round: null,
            strokes: [],
            result: null,
          });
          continue;
        }
        expect(view.result !== null, where).toBe(phase === 'result');
        // The strokes replay to the round on screen, brought to the same tick.
        const replayed = playPetting(view.round!.tastes, view.strokes);
        expect(replayed, where).toEqual(
          stepPetting(view.round!, PETTING.roundTicks),
        );
        for (const { tick } of view.strokes)
          expect(tick, where).toBeLessThan(PETTING.roundTicks);
      }
    }
  });
});

describe('petting screen', () => {
  it('is closed without a round or without its cat', () => {
    expect(pettingScreen(closedPetting(), MOCHI, REST)).toEqual({
      open: false,
    });
    expect(pettingScreen(after([open]), null, REST)).toEqual({ open: false });
  });

  it('shows four spots whose tastes are not known yet', () => {
    const screen = screenOf(after([open]));
    expect(screen.title).toBe('摸摸 Mochi');
    expect(screen.secondsLeft).toBe(12);
    expect(
      screen.spots.map((spot) => [spot.name, spot.mark, spot.label]),
    ).toEqual([
      ['头顶', '?', '头顶，还不知道'],
      ['下巴', '?', '下巴，还不知道'],
      ['后背', '?', '后背，还不知道'],
      ['肚子', '?', '肚子，还不知道'],
    ]);
    expect(screen.spots.every((spot) => !spot.touched && !spot.glow)).toBe(
      true,
    );
    expect(
      screen.spots.filter((spot) => spot.focused).map((spot) => spot.spot),
    ).toEqual(['HEAD']);
    expect(screen.result).toBeNull();
  });

  it('marks a spot from the cat’s reaction, and the ones found out before', () => {
    const screen = screenOf(after([open, stroke('CHIN')]), {
      ...MOCHI,
      petting: { ...MOCHI.petting, discovered: ['BELLY'] },
    });
    expect(screen.spots.map((spot) => spot.label)).toEqual([
      '头顶，还不知道',
      '下巴，最喜欢',
      '后背，还不知道',
      '肚子，不喜欢',
    ]);
    expect(screen.spots.map((spot) => spot.mark)).toEqual(['?', '♥', '?', '✕']);
  });

  it('follows the purr, and says when to stroke', () => {
    const swelling = screenOf(after([open]));
    expect(swelling).toMatchObject({
      purr: true,
      hint: '呼噜声起来了，现在摸',
    });
    const quiet = screenOf(after([open, ...ticks(PETTING.purr.windowTicks)]));
    expect(quiet).toMatchObject({
      purr: false,
      hint: '慢慢来：等呼噜声起来再摸',
    });
  });

  it('shows the cat pleased by a good stroke, for a moment', () => {
    const stroked = after([open, stroke('CHIN')]);
    expect(screenOf(stroked)).toMatchObject({
      pose: { face: 'happy', ears: 'up' },
      bubble: '呼噜呼噜♪',
      meter: { value: PETTING.meter.favourite.purring },
    });
    const later = screenOf(after(ticks(PETTING.ticksPerSecond), stroked));
    expect(later).toMatchObject({ pose: REST, bubble: null });
  });

  it('lights the stroked spot in the colour of its taste, on the cat and in the bar, for a moment', () => {
    const glow = (view: PettingView) =>
      screenOf(view).spots.map((spot) => [spot.touched, spot.glow]);
    const loved = after([open, stroke('CHIN')]);
    expect(glow(loved)).toEqual([
      [false, null],
      [true, 'favourite'],
      [false, null],
      [false, null],
    ]);
    expect(glow(after([open, stroke('HEAD')]))[0]).toEqual([true, 'neutral']);
    expect(glow(after([open, stroke('BELLY')]))[3]).toEqual([true, 'disliked']);
    expect(
      glow(after(ticks(PETTING.ticksPerSecond), loved)).every(
        ([touched, glow]) => !touched && !glow,
      ),
    ).toBe(true);
  });

  it('shows the cat pulled away, and back a second later', () => {
    const away = after([open, stroke('BELLY')]);
    expect(screenOf(away)).toMatchObject({
      away: true,
      purr: false,
      pose: { face: 'glum', ears: 'mid' },
      bubble: '不要摸这里',
      hint: 'Mochi 躲开了，等它回来',
    });
    expect(screenOf(after(ticks(PETTING.awayTicks), away)).away).toBe(false);
  });

  it('says when strokes come too fast', () => {
    const hurried = after([
      open,
      ...Array.from({ length: PETTING.pace.maxStrokes + 1 }, () =>
        stroke('HEAD'),
      ),
    ]);
    expect(screenOf(hurried)).toMatchObject({
      away: true,
      bubble: '太快啦',
    });
  });

  it('shows Core’s result with one line in the cat’s voice', () => {
    const ended = after([open, stroke('CHIN'), ...ticks(PETTING.roundTicks)]);
    const screen = screenOf(
      after([{ type: 'settled', result: RESULT }], ended),
    );
    expect(screen).toMatchObject({
      phase: 'result',
      meter: { value: RESULT.meter, label: '满足 80%' },
      hint: '',
      result: {
        line: '……下巴这里，再摸一会儿也可以。',
        change: '心情 +6',
        mood: '😺 平静',
        bond: '亲密 +2',
        today: '今天还有 2 次摸摸会让关系更近',
        notes: [],
      },
    });
    expect(screen.spots.every((spot) => spot.disabled)).toBe(true);
  });

  it('says what else changed, and when a round lifted no mood because of the allowance', () => {
    const ended = after([open, stroke('BELLY'), ...ticks(PETTING.roundTicks)]);
    const unkind = {
      spot: 'BELLY',
      meter: 0,
      mood: -1,
      full: true,
      note: 'Mochi 心情落了一点（有点闷）',
      moodAfter: 49,
      bond: 0,
      bondLeft: 0,
    } as const;
    expect(
      screenOf(after([{ type: 'settled', result: unkind }], ended)).result,
    ).toEqual({
      line: '肚子……不要。我先躲一下。',
      change: '心情 −1',
      mood: '😾 有点闷',
      bond: '',
      today: '今天的亲密已经到了，摸摸还是会让它开心',
      notes: ['Mochi 心情落了一点（有点闷）'],
    });
    const { rounds, windowMinutes } = CARE.pettingLifts;
    const spent = { ...RESULT, mood: 0, full: false } as const;
    expect(
      screenOf(after([{ type: 'settled', result: spent }], ended)).result,
    ).toMatchObject({
      change: '心情 +0',
      notes: [
        `最近 ${windowMinutes / 60} 小时里已经摸过 ${rounds} 回，这一回心情没有再涨`,
      ],
    });
  });

  it('says so when the round passed without a stroke', () => {
    const ended = after([
      open,
      ...ticks(PETTING.roundTicks),
      { type: 'settled', result: 'none' },
    ]);
    expect(screenOf(ended).result).toEqual({
      line: '这一回还没摸到它。想摸的时候再来。',
      change: '',
      mood: '',
      bond: '',
      today: '',
      notes: [],
    });
  });
});

describe('good rounds left today', () => {
  it('are the day’s allowance less the rounds counted today; earlier days do not count', () => {
    const minute = 3 * BOND.dayMinutes + 100;
    const left = (pettingBond: { day: number; count: number } | null) =>
      pettingBondLeft({ pettingBond }, minute);
    expect(left(null)).toBe(BOND.pettingPerDay);
    expect(left({ day: 3, count: 1 })).toBe(BOND.pettingPerDay - 1);
    expect(left({ day: 3, count: BOND.pettingPerDay })).toBe(0);
    expect(left({ day: 2, count: BOND.pettingPerDay })).toBe(
      BOND.pettingPerDay,
    );
  });
});

describe('reaction lines', () => {
  it('differ by cat, by how it takes the spot and by how the round went', () => {
    const lines = new Set<string>();
    for (const cat of ['MOCHI', 'PEPPER'] as const)
      for (const spot of ['CHIN', 'HEAD', 'BELLY'] as const)
        for (const good of [true, false]) {
          const line = reactionLine(cat, TASTES, spot, good);
          expect(line).toMatch(/[一-鿿]/);
          expect(line).not.toContain('{');
          lines.add(line);
        }
    expect(lines.size).toBe(12);
  });

  it('name the spot they are about', () => {
    expect(reactionLine('PEPPER', TASTES, 'CHIN', true)).toBe(
      '就是下巴！再来再来！',
    );
    expect(
      reactionLine(
        'PEPPER',
        { favourite: 'BACK', disliked: 'HEAD' },
        'BACK',
        true,
      ),
    ).toBe('就是后背！再来再来！');
  });
});

describe('the way in from the cats panel', () => {
  it('is free and open unless Core would refuse', () => {
    expect(pettingEntry(MOCHI, TASTES, { ok: true })).toEqual({
      label: '摸摸 Mochi',
      disabled: false,
      note: '不花体力和金币，想摸就摸',
      known: '',
    });
    expect(
      pettingEntry(MOCHI, TASTES, { ok: false, error: 'CAT_BUSY' }),
    ).toMatchObject({
      disabled: true,
      note: '这只猫正在钓鱼，先收好鱼竿再安排。',
    });
  });

  it('remembers the favourite and the disliked spot once found out', () => {
    expect(knownTastes(TASTES, [])).toBe('');
    expect(knownTastes(TASTES, ['HEAD', 'BACK'])).toBe('');
    expect(knownTastes(TASTES, ['CHIN'])).toBe('最喜欢 下巴');
    expect(knownTastes(TASTES, ['HEAD', 'CHIN', 'BELLY'])).toBe(
      '最喜欢 下巴 · 不喜欢 肚子',
    );
  });
});

describe('strokes from a touch', () => {
  const at = (x: number, y = 0) => ({ x, y });
  it('a press on a spot is one stroke; a press beside the spots is none', () => {
    expect(
      reduceStroke(null, { type: 'down', point: at(0), spot: 'HEAD' }),
    ).toEqual({
      gesture: at(0),
      stroke: 'HEAD',
    });
    expect(
      reduceStroke(null, { type: 'down', point: at(0), spot: null }),
    ).toEqual({
      gesture: at(0),
      stroke: null,
    });
  });

  it('a drag strokes again each time it has travelled far enough over a spot', () => {
    const down = reduceStroke(null, {
      type: 'down',
      point: at(0),
      spot: 'HEAD',
    }).gesture;
    const near = reduceStroke(down, {
      type: 'move',
      point: at(STROKE_TRAVEL_PX - 1),
      spot: 'HEAD',
    });
    expect(near).toEqual({ gesture: down, stroke: null });
    const far = reduceStroke(down, {
      type: 'move',
      point: at(0, STROKE_TRAVEL_PX),
      spot: 'CHIN',
    });
    expect(far).toEqual({ gesture: at(0, STROKE_TRAVEL_PX), stroke: 'CHIN' });
    // Travel between the spots keeps counting until the finger is over one again.
    const between = reduceStroke(down, {
      type: 'move',
      point: at(200),
      spot: null,
    });
    expect(between).toEqual({ gesture: down, stroke: null });
  });

  it('a pointer that is not down strokes nothing', () => {
    expect(
      reduceStroke(null, { type: 'move', point: at(500), spot: 'HEAD' }),
    ).toEqual({
      gesture: null,
      stroke: null,
    });
    expect(reduceStroke(at(3), { type: 'up' })).toEqual({
      gesture: null,
      stroke: null,
    });
  });
});
