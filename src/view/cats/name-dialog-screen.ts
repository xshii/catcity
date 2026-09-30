import { NAME_MAX_LENGTH } from '../../content/names';
import {
  cityNames,
  suggestNames,
  type CatEntity,
  type WorldState,
} from '../../core';

/** Words of the name box (spec 041 ui-design 5.4). */
export const NAME_COPY = {
  clear: '清空',
  suggestions: '推荐的名字',
  more: '↻ 换一批',
  cancel: '取消',
  blank: (name: string) => `不填的话就叫 ${name}`,
  namesake: (name: string) => `城里已经有一只${name}了`,
  tooLong: `名字最多 ${NAME_MAX_LENGTH} 个字`,
  /** A kitten's sex, the player's to choose (T-22, user 2026-09-30). */
  sex: {
    group: '它是',
    choices: {
      M: { text: '♂ 公', label: '公猫' },
      F: { text: '♀ 母', label: '母猫' },
    },
    missing: '先选：公猫还是母猫',
  },
} as const;
type Sex = CatEntity['sex'];
const SEXES: readonly Sex[] = ['M', 'F'];

/**
 * How the name box opens: its question, the confirm button's words, the name in the field
 * at first (for a rename, the cat's own: no namesake of itself) and the salt its
 * suggestions shuffle by (Core's `nameSalt`, or the next id's serial for a kitten). A
 * kitten's box also asks its sex, with neither chosen at first.
 */
export interface NameDialogInput {
  title: string;
  confirm: string;
  initial: string;
  salt: number;
  askSex?: boolean;
}

/** What the field keeps of typed text: no line break or other control character, 12 characters. */
export const typedName = (text: string): string =>
  Array.from(text.replace(/\p{Cc}/gu, ''))
    .slice(0, NAME_MAX_LENGTH)
    .join('');

/**
 * The box with `text` in its field on suggestion page `page` (R-16): the six suggestions,
 * the one in the field marked; the name confirming gives, trimmed, or when blank the first
 * suggestion of the first page, as Core would suggest it; and one note under the field.
 * A kitten's box has the two sexes, `sex` marked, and confirms only once one is chosen.
 */
export function nameDialogScreen(
  world: WorldState,
  input: NameDialogInput,
  text: string,
  page: number,
  sex: Sex | null = null,
) {
  const typed = text.trim();
  const fallback = suggestNames(world, input.salt, 0)[0]!;
  // Companions and residents alike (T-30); the cat being renamed is no namesake of itself.
  const namesakes =
    cityNames(world).filter((name) => name === typed).length -
    (typed === input.initial ? 1 : 0);
  return {
    suggestions: suggestNames(world, input.salt, page).map((name) => ({
      name,
      checked: name === typed,
    })),
    name: typed || fallback,
    sex: input.askSex
      ? {
          choices: SEXES.map((value) => ({
            value,
            ...NAME_COPY.sex.choices[value],
            checked: value === sex,
          })),
          note: sex ? '' : NAME_COPY.sex.missing,
        }
      : null,
    ready: !input.askSex || sex !== null,
    note: !typed
      ? NAME_COPY.blank(fallback)
      : namesakes > 0
        ? NAME_COPY.namesake(typed)
        : Array.from(text).length >= NAME_MAX_LENGTH
          ? NAME_COPY.tooLong
          : '',
  };
}
