import type { CatDefinitionId } from '../../content/cats';
import {
  PETTING,
  PET_SPOTS,
  PET_SPOT_NAMES,
  type PetSpot,
  type PetTaste,
} from '../../content/petting';
import { BOND, CARE } from '../../content/care';
import { gameDay, type CatEntity, type CheckResult } from '../../core';
import {
  pettingAway,
  purring,
  tasteOf,
  type PetReaction,
  type PetTastes,
} from '../../minigames/petting';
import type { CatPose } from '../art/cat-look';
import { ERROR_MESSAGES } from '../shell/errors';
import { moodBadge } from '../shell/mood';
import { pettingPhase, type PettingView } from './view-state';

/** How long a reaction stays on the cat's face and in its bubble. */
const REACTION_TICKS = PETTING.ticksPerSecond;

/** Player-facing words of the petting screen (spec 039). */
export const PETTING_COPY = {
  enter: (name: string) => `摸摸 ${name}`,
  free: '不花体力和金币，想摸就摸',
  close: '不摸了',
  meter: '满足',
  again: '再摸一会儿',
  done: '好了',
  tastes: {
    favourite: { mark: '♥', label: '最喜欢' },
    neutral: { mark: '○', label: '还行' },
    disliked: { mark: '✕', label: '不喜欢' },
  } satisfies Record<PetTaste, { mark: string; label: string }>,
  unknown: '还不知道',
  /** The bar's mark for a spot not yet found out. */
  unknownMark: '?',
  reactions: {
    purr: '呼噜呼噜♪',
    like: '喜欢～',
    fine: '嗯…',
    dislike: '不要摸这里',
    hurried: '太快啦',
  } satisfies Record<PetReaction, string>,
  hints: {
    wait: '慢慢来：等呼噜声起来再摸',
    purr: '呼噜声起来了，现在摸',
    away: (name: string) => `${name} 躲开了，等它回来`,
  },
  /** A kind round past the allowance of lifts (user 2026-09-30). */
  spent: (rounds: number, hours: number) =>
    `最近 ${hours} 小时里已经摸过 ${rounds} 回，这一回心情没有再涨`,
  bond: (points: number) => `亲密 +${points}`,
  bondLeft: (rounds: number) => `今天还有 ${rounds} 次摸摸会让关系更近`,
  bondDone: '今天的亲密已经到了，摸摸还是会让它开心',
  untouched: '这一回还没摸到它。想摸的时候再来。',
  keys: '键盘：方向键选部位，空格抚摸',
  bar: '摸哪里',
} as const;

/**
 * One line in the cat's own voice, by its personality, how it takes the spot stroked
 * most, and whether the round went well.
 */
const LINES: Record<
  CatDefinitionId,
  Record<PetTaste, { good: string; poor: string }>
> = {
  // Shy and slow to warm: few words, said quietly.
  MOCHI: {
    favourite: {
      good: '……{spot}这里，再摸一会儿也可以。',
      poor: '{spot}……其实是喜欢的。慢一点就好。',
    },
    neutral: {
      good: '嗯……这样待着，挺安心的。',
      poor: '{spot}还行……别的地方，也可以试试。',
    },
    disliked: {
      good: '{spot}不太行……不过别的地方很舒服。',
      poor: '{spot}……不要。我先躲一下。',
    },
  },
  // Curious and playful: quick, and says what it wants.
  PEPPER: {
    favourite: {
      good: '就是{spot}！再来再来！',
      poor: '{spot}对了！跟着我的呼噜声再来一次？',
    },
    neutral: {
      good: '不错不错，下回换个地方探探险？',
      poor: '{spot}嘛，一般般。猜猜我最喜欢哪儿？',
    },
    disliked: {
      good: '{spot}可不行！别的地方倒是很棒。',
      poor: '喂，{spot}不给摸！',
    },
  },
};

export function reactionLine(
  definitionId: CatDefinitionId,
  tastes: PetTastes,
  spot: PetSpot,
  good: boolean,
): string {
  const line = LINES[definitionId][tasteOf(tastes, spot)];
  return (good ? line.good : line.poor).replaceAll(
    '{spot}',
    PET_SPOT_NAMES[spot],
  );
}

/** The spots of a cat the player knows, as words: '最喜欢 下巴 · 不喜欢 肚子'. */
export function knownTastes(tastes: PetTastes, discovered: readonly PetSpot[]) {
  return (['favourite', 'disliked'] as const)
    .filter((taste) => discovered.includes(tastes[taste]))
    .map(
      (taste) =>
        `${PETTING_COPY.tastes[taste].label} ${PET_SPOT_NAMES[tastes[taste]]}`,
    )
    .join(' · ');
}

/** The cats panel's way in: always free, closed only by what Core would refuse. */
export function pettingEntry(
  cat: Pick<CatEntity, 'name' | 'petting'>,
  tastes: PetTastes,
  check: CheckResult,
) {
  return {
    label: PETTING_COPY.enter(cat.name),
    disabled: !check.ok,
    note: check.ok ? PETTING_COPY.free : ERROR_MESSAGES[check.error],
    known: knownTastes(tastes, cat.petting.discovered),
  };
}

/** Good rounds that still earn bond points today (041 R-20): the day's allowance less those counted. */
export function pettingBondLeft(
  cat: Pick<CatEntity, 'pettingBond'>,
  minute: number,
): number {
  const counted =
    cat.pettingBond?.day === gameDay(minute) ? cat.pettingBond.count : 0;
  return BOND.pettingPerDay - counted;
}

const signed = (value: number) =>
  value < 0 ? `−${Math.abs(value)}` : `+${value}`;

/**
 * What the petting screen shows, decided from the view state and the cat alone (spec
 * 015): the DOM only applies it.
 */
export function pettingScreen(
  view: PettingView,
  cat: Pick<CatEntity, 'name' | 'definitionId' | 'petting'> | null,
  /** The cat's look when nothing is happening to it. */
  rest: CatPose,
) {
  const phase = pettingPhase(view);
  const round = view.round;
  if (phase === 'closed' || !round || !cat) return { open: false as const };
  const playing = phase === 'playing';
  const away = playing && pettingAway(round);
  const last =
    playing && round.last && round.tick - round.last.tick < REACTION_TICKS
      ? round.last
      : null;
  const pleased = last?.reaction === 'purr' || last?.reaction === 'like';
  const result = view.result;
  const settled = result && result !== 'none' ? result : null;
  const known = (spot: PetSpot) =>
    cat.petting.discovered.includes(spot) || round.counts[spot] > 0;
  return {
    open: true as const,
    phase,
    title: PETTING_COPY.enter(cat.name),
    meter: {
      value: settled?.meter ?? round.meter,
      label: `${PETTING_COPY.meter} ${settled?.meter ?? round.meter}%`,
    },
    secondsLeft: Math.ceil(
      (PETTING.roundTicks - round.tick) / PETTING.ticksPerSecond,
    ),
    /** The purr swells: a stroke now counts for more. */
    purr: playing && !away && purring(round.tick),
    away,
    pose: {
      curled: false,
      face: away ? 'glum' : pleased || result ? 'happy' : rest.face,
      ears: away ? 'mid' : pleased || result ? 'up' : rest.ears,
    } satisfies CatPose as CatPose,
    spots: PET_SPOTS.map((spot) => {
      const taste = known(spot)
        ? PETTING_COPY.tastes[tasteOf(round.tastes, spot)]
        : null;
      /** The stroke the cat is reacting to landed here. */
      const touched = last?.spot === spot;
      return {
        spot,
        name: PET_SPOT_NAMES[spot],
        mark: taste?.mark ?? PETTING_COPY.unknownMark,
        label: `${PET_SPOT_NAMES[spot]}，${taste?.label ?? PETTING_COPY.unknown}`,
        focused: playing && view.focus === spot,
        disabled: !playing,
        touched,
        /** The region on the cat and the bar's cell glow in the colour of the spot's taste. */
        glow: touched ? tasteOf(round.tastes, spot) : null,
      };
    }),
    /** The cat's reaction, always below it (ui-design 5.5). */
    bubble: last ? PETTING_COPY.reactions[last.reaction] : null,
    hint: !playing
      ? ''
      : away
        ? PETTING_COPY.hints.away(cat.name)
        : purring(round.tick)
          ? PETTING_COPY.hints.purr
          : PETTING_COPY.hints.wait,
    result: !result
      ? null
      : result === 'none'
        ? {
            line: PETTING_COPY.untouched,
            change: '',
            mood: '',
            bond: '',
            today: '',
            notes: [] as string[],
          }
        : {
            line: reactionLine(
              cat.definitionId,
              round.tastes,
              result.spot,
              result.meter >= PETTING.good,
            ),
            change: `心情 ${signed(result.mood)}`,
            mood: moodBadge(result.moodAfter).text,
            bond: result.bond > 0 ? PETTING_COPY.bond(result.bond) : '',
            today:
              result.bondLeft > 0
                ? PETTING_COPY.bondLeft(result.bondLeft)
                : PETTING_COPY.bondDone,
            notes: [
              ...(result.full
                ? []
                : [
                    PETTING_COPY.spent(
                      CARE.pettingLifts.rounds,
                      CARE.pettingLifts.windowMinutes / 60,
                    ),
                  ]),
              ...(result.note ? [result.note] : []),
            ],
          },
  };
}
