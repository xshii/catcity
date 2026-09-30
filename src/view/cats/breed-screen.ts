import { BOND_LEVELS } from '../../content/care';
import { MAX_COMPANIONS } from '../../content/cats';
import { BREED_BOND_LEVEL, BREED_COOLDOWN_MINUTES } from '../../content/family';
import { moodBand } from '../../content/mood';
import {
  catBreedBlocks,
  cityBreedBlocks,
  pairBreedBlocks,
  type BreedBlock,
  type CatEntity,
  type WorldState,
} from '../../core';
import { MOOD_COPY } from '../shell/mood';

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
      };
    });
  return {
    open: BREED_COPY.open(self.name),
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
