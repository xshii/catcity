import { NAME_MAX_LENGTH } from '../../content/names';
import { suggestNames, type WorldState } from '../../core';

/** Words of the name box (spec 041 ui-design 5.4). */
export const NAME_COPY = {
  clear: '清空',
  suggestions: '推荐的名字',
  more: '↻ 换一批',
  cancel: '取消',
  blank: (name: string) => `不填的话就叫 ${name}`,
  namesake: (name: string) => `城里已经有一只${name}了`,
  tooLong: `名字最多 ${NAME_MAX_LENGTH} 个字`,
} as const;

/**
 * How the name box opens: its question, the confirm button's words, the name in the field
 * at first (for a rename, the cat's own: no namesake of itself) and the salt its
 * suggestions shuffle by (Core's `nameSalt`, or the next id's serial for a kitten).
 */
export interface NameDialogInput {
  title: string;
  confirm: string;
  initial: string;
  salt: number;
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
 */
export function nameDialogScreen(
  world: WorldState,
  input: NameDialogInput,
  text: string,
  page: number,
) {
  const typed = text.trim();
  const fallback = suggestNames(world, input.salt, 0)[0]!;
  const namesakes =
    world.cats.filter((cat) => cat.name === typed).length -
    (typed === input.initial ? 1 : 0);
  return {
    suggestions: suggestNames(world, input.salt, page).map((name) => ({
      name,
      checked: name === typed,
    })),
    name: typed || fallback,
    note: !typed
      ? NAME_COPY.blank(fallback)
      : namesakes > 0
        ? NAME_COPY.namesake(typed)
        : Array.from(text).length >= NAME_MAX_LENGTH
          ? NAME_COPY.tooLong
          : '',
  };
}
