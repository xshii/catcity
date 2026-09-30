import { mkdir, readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { APPEARANCE_OPTIONS, type CatAppearance } from '../../src/content/cats';
import {
  ART_BREEDS,
  catLook,
  portraitShapes,
  type ArtBreed,
  type CatLook,
  type CatPose,
} from '../../src/view/art/cat-look';
import { pettingCat } from '../../src/view/art/cat-petting';
import { catPortrait, shapeSvg } from '../../src/view/art/illustrations';

// Spec 041 T-14 PR 1 (cat-looks.md 1 and 5, ui-design 6.1): every option of the five
// choices on each breed, and typical cats made of them, as every renderer draws them.

/** ui-design 8: the task's screenshots. */
const SHOTS = 'artifacts/T-14';
/** Labels of the sheet only. */
const ITEM_NAMES = {
  colour: '毛色',
  pattern: '花纹',
  white: '白斑',
  eyes: '眼色',
  face: '脸型',
} as const;
const OPTION_NAMES: {
  [Item in keyof CatAppearance]: Record<CatAppearance[Item], string>;
} = {
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
};
const BREED_NAMES: Record<ArtBreed, string> = {
  DOMESTIC: '田园猫',
  RAGDOLL: '布偶猫',
  BRITISH_SHORTHAIR: '英短猫',
};
const PLAIN: CatAppearance = {
  colour: 'cream',
  pattern: 'solid',
  white: 'none',
  eyes: 'blue',
  face: 'round',
};
const cat = (...[colour, pattern, white, eyes, face]: string[]) =>
  ({ colour, pattern, white, eyes, face }) as CatAppearance;
/** Cats players know, made of the five; a calico's patches become orange with white. */
const TYPICAL: [string, CatAppearance][] = [
  ['踏雪', cat('black', 'solid', 'mittens', 'green', 'round')],
  ['奶牛', cat('black', 'solid', 'cow', 'copper', 'round')],
  [
    '三花风（橘 + 双色）',
    cat('orange', 'tabby', 'bicolour', 'green', 'pointed'),
  ],
  ['狸花', cat('brown', 'tabby', 'none', 'green', 'pointed')],
  ['暹罗风', cat('cream', 'point', 'none', 'blue', 'long')],
  ['海豹双色', cat('white', 'point', 'bicolour', 'blue', 'round')],
];
const CALM: CatPose = { face: 'calm', ears: 'up', curled: false };

async function watched(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

/** One cat: as the map draws it (tail behind the head), its portrait, dozing, and petted. */
function cell(look: CatLook, caption: string) {
  const figure = [...look.tail, ...portraitShapes(look, CALM)]
    .map((shape) => shapeSvg(shape, look.colours))
    .join('');
  return (
    '<figure>' +
    `<svg viewBox="2 0 84 64" aria-hidden="true">${figure}</svg>` +
    catPortrait(look, CALM) +
    catPortrait(look, { ...CALM, curled: true }) +
    pettingCat(look, CALM) +
    `<figcaption>${caption}</figcaption></figure>`
  );
}
/** Each option alone on a plain cream cat, then the typical cats; a column per breed. */
function sheet(tokens: string) {
  const items = Object.keys(APPEARANCE_OPTIONS) as (keyof CatAppearance)[];
  const rows: [string, CatAppearance][] = [
    ...items.flatMap((item) =>
      APPEARANCE_OPTIONS[item].map((option): [string, CatAppearance] => [
        `${ITEM_NAMES[item]}：${(OPTION_NAMES[item] as Record<string, string>)[option]}`,
        { ...PLAIN, [item]: option },
      ]),
    ),
    ...TYPICAL,
  ];
  const cells = rows.flatMap(([name, appearance]) =>
    ART_BREEDS.map((breed) =>
      cell(catLook(breed, appearance), `${name} · ${BREED_NAMES[breed]}`),
    ),
  );
  return `<!doctype html><meta charset="utf-8"><style>${tokens}
    body { margin: 0; background: var(--paper); color: var(--text); font: 13px var(--font-ui); }
    #sheet { display: grid; grid-template-columns: repeat(${ART_BREEDS.length}, 420px); gap: 10px; padding: 16px; width: max-content; }
    figure { margin: 0; display: grid; grid-template-columns: 100px 56px 56px 1fr; align-items: end; gap: 4px; }
    figure svg:first-child { width: 100px; height: 76px; }
    figure svg { width: 56px; height: 56px; }
    figure svg:nth-of-type(4) { width: 188px; height: 118px; }
    figcaption { grid-column: 1 / -1; text-align: center; }
  </style><main id="sheet">${cells.join('')}</main>`;
}

test('a sheet of every option of the five on each breed, and typical cats', async ({
  page,
}) => {
  const errors = await watched(page);
  await mkdir(SHOTS, { recursive: true });
  await page.setContent(
    sheet(await readFile('src/view/styles/tokens.css', 'utf8')),
  );
  const options = Object.values(APPEARANCE_OPTIONS).flat().length;
  const cells = page.locator('#sheet figure');
  await expect(cells).toHaveCount((options + TYPICAL.length) * 3);
  for (const figure of await cells.all())
    await expect(figure.locator('svg')).toHaveCount(4);
  await page.locator('#sheet').screenshot({ path: `${SHOTS}/looks.png` });
  expect(errors).toEqual([]);
});
