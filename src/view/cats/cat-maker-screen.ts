import { CAT_BREEDS } from '../../content/breeds';
import { APPEARANCE_OPTIONS, type CatAppearance } from '../../content/cats';
import {
  ART_BREEDS,
  catLook,
  type ArtBreed,
  type CatPose,
} from '../art/cat-look';

/** Words of the cat maker (spec 041 cat-looks.md 4); the domestic cat's until PR 2. */
export const CAT_MAKER_COPY = {
  title: '它长什么样？',
  items: {
    breed: '品种',
    colour: '毛色',
    pattern: '花纹',
    white: '白斑',
    eyes: '眼色',
    face: '脸型',
  },
  options: {
    colour: {
      black: '黑',
      gray: '灰',
      orange: '橘',
      cream: '奶油',
      white: '白',
      brown: '棕',
    },
    pattern: { solid: '纯色', tabby: '虎斑', point: '重点色' },
    white: {
      none: '无',
      mittens: '手套',
      bib: '围兜',
      cow: '奶牛',
      bicolour: '双色',
    },
    eyes: { blue: '蓝', copper: '铜', green: '黄绿' },
    face: { round: '圆', pointed: '尖', long: '长' },
  } satisfies {
    [Item in keyof CatAppearance]: Record<CatAppearance[Item], string>;
  },
  /** Each breed and what it brings to fishing. */
  breeds: {
    ...CAT_BREEDS,
    DOMESTIC: { name: '田园猫', fishingHint: '什么鱼都愿意陪你钓' },
  } satisfies Record<ArtBreed, { name: string; fishingHint: string }>,
  random: '🎲 随机',
  randomLabel: '随机换一只',
  cancel: '取消',
} as const;

/** What the maker makes: a breed and the five choices. */
export interface CatChoice {
  breed: ArtBreed;
  appearance: CatAppearance;
}
/**
 * How the maker opens: whether the breed may be picked (only the stray at the start), the
 * confirm button's words, and the cat it starts from.
 */
export interface CatMakerInput extends CatChoice {
  pickBreed: boolean;
  confirm: string;
}
export type MakerItem = 'breed' | keyof CatAppearance;
/** Calm, eyes open: the eye colour shows. */
export const PREVIEW_POSE: CatPose = {
  face: 'calm',
  ears: 'up',
  curled: false,
};

const ITEMS = Object.keys(APPEARANCE_OPTIONS) as (keyof CatAppearance)[];
const rowsOf = (pickBreed: boolean): MakerItem[] =>
  pickBreed ? ['breed', ...ITEMS] : ITEMS;
const optionsOf = (item: MakerItem): readonly string[] =>
  item === 'breed' ? ART_BREEDS : APPEARANCE_OPTIONS[item];
const nameOf = (item: MakerItem, option: string) =>
  item === 'breed'
    ? CAT_MAKER_COPY.breeds[option as ArtBreed].name
    : (CAT_MAKER_COPY.options[item] as Record<string, string>)[option]!;

/** The choice with one row's option picked; an option the row lacks changes nothing. */
export function choose(
  choice: CatChoice,
  item: MakerItem,
  option: string,
): CatChoice {
  if (!optionsOf(item).includes(option)) return choice;
  return item === 'breed'
    ? { ...choice, breed: option as ArtBreed }
    : { ...choice, appearance: { ...choice.appearance, [item]: option } };
}

/**
 * 🎲: each row's option drawn from `random` (one number in [0, 1) per row, in the rows'
 * order); the breed only when it may be picked. Only the screen's choice changes.
 */
export function randomChoice(
  choice: CatChoice,
  pickBreed: boolean,
  random: () => number,
): CatChoice {
  return rowsOf(pickBreed).reduce((made, item) => {
    const options = optionsOf(item);
    const at = Math.floor(random() * options.length);
    return choose(made, item, options[Math.min(at, options.length - 1)]!);
  }, choice);
}

/** What the screen shows: a row per item, its options named and one marked, and the look. */
export function catMakerScreen(pickBreed: boolean, choice: CatChoice) {
  const chosen: Record<MakerItem, string> = {
    breed: choice.breed,
    ...choice.appearance,
  };
  return {
    rows: rowsOf(pickBreed).map((item) => ({
      item,
      label: CAT_MAKER_COPY.items[item],
      options: optionsOf(item).map((option) => ({
        option,
        name: nameOf(item, option),
        hint:
          item === 'breed'
            ? CAT_MAKER_COPY.breeds[option as ArtBreed].fishingHint
            : null,
        checked: chosen[item] === option,
      })),
    })),
    look: catLook(choice.breed, choice.appearance),
  };
}
