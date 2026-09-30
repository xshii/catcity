import { describe, expect, it, vi } from 'vitest';
import type { CatAppearance } from '../../src/content/cats';
import { catLook, type CatPose } from '../../src/view/art/cat-look';
import { pettingCat } from '../../src/view/art/cat-petting';
import { mountCatMaker } from '../../src/view/cats/cat-maker';
import type {
  CatChoice,
  CatMakerInput,
} from '../../src/view/cats/cat-maker-screen';
import { $, click, key, openGame, text, visible } from '../helpers/view-rig';

// Spec 041 T-14 PR 1b (cat-looks.md 2 and 4, ui-design 7 and 8): the cat maker.

const PLAIN: CatAppearance = {
  colour: 'cream',
  pattern: 'solid',
  white: 'none',
  eyes: 'blue',
  face: 'round',
};
/** The stray at the start: the breed may be picked. */
const STRAY: CatMakerInput = {
  pickBreed: true,
  confirm: '就是它了',
  breed: 'DOMESTIC',
  appearance: PLAIN,
};
const CALM: CatPose = { face: 'calm', ears: 'up', curled: false };

/** The maker over the page, its 🎲 fed `randoms` in turn; what it gives goes to `done`. */
function mount(input: Partial<CatMakerInput> = {}, randoms: number[] = [0]) {
  let next = 0;
  const done = vi.fn<(choice: CatChoice | null) => void>();
  mountCatMaker({
    layer: document.body,
    input: { ...STRAY, ...input },
    random: () => randoms[next++ % randoms.length]!,
    done,
  });
  return done;
}
/** The maker over the running game. */
function open(input: Partial<CatMakerInput> = {}, randoms?: number[]) {
  const game = openGame();
  return { game, done: mount(input, randoms) };
}
const radio = (item: string, option: string) =>
  $<HTMLButtonElement>(
    `#cat-maker [data-item="${item}"][data-option="${option}"]`,
  );
const all = (selector: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(`#cat-maker ${selector}`));
/** The chosen option of each row, as the screen marks it. */
const checked = () =>
  Object.fromEntries(
    all('[role="radio"][aria-checked="true"]').map((button) => [
      button.dataset.item,
      button.dataset.option,
    ]),
  );
const names = (item: string) =>
  all(`[role="radio"][data-item="${item}"]`).map(
    (button) => button.textContent,
  );
const preview = () => $('#cat-maker-preview').innerHTML;
/** The petting screen's cat for a look, as the page holds its markup. */
const petted = (...look: Parameters<typeof catLook>) => {
  const box = document.createElement('div');
  box.innerHTML = pettingCat(catLook(...look), CALM);
  return box.innerHTML;
};

describe('the cat maker (cat-looks.md 4)', () => {
  it('shows a row for the breed, with what each breed brings to fishing, and one for each of the five', () => {
    open();
    expect(visible('#cat-maker')).toBe(true);
    expect($('#cat-maker').getAttribute('role')).toBe('dialog');
    expect(text('#cat-maker-title')).toBe('它长什么样？');
    const rows = all('[role="radiogroup"]');
    expect(rows.map((row) => row.dataset.item)).toEqual([
      'breed',
      'colour',
      'pattern',
      'white',
      'eyes',
      'face',
    ]);
    // Each row is named for screen readers by its label.
    expect(
      rows.map(
        (row) =>
          document.getElementById(row.getAttribute('aria-labelledby')!)!
            .textContent,
      ),
    ).toEqual(['品种', '毛色', '花纹', '白斑', '眼色', '脸型']);
    expect(names('breed')).toEqual([
      '田园猫什么鱼都愿意陪你钓',
      '布偶猫能吸引 4 星锦鲤',
      '英短猫能吸引 5 星月光鲤',
    ]);
    expect(names('colour')).toEqual(['黑', '灰', '橘', '奶油', '白', '棕']);
    expect(names('pattern')).toEqual(['纯色', '虎斑', '重点色']);
    expect(names('white')).toEqual(['无', '手套', '围兜', '奶牛', '双色']);
    expect(names('eyes')).toEqual(['蓝', '铜', '黄绿']);
    expect(names('face')).toEqual(['圆', '尖', '长']);
    expect(text('#cat-maker-random')).toBe('🎲 随机');
    expect(text('#cat-maker-cancel')).toBe('取消');
    expect(text('#cat-maker-confirm')).toBe('就是它了');
  });

  it('leaves the breed out when it may not be picked, and says what confirming does', () => {
    open({ pickBreed: false, breed: 'RAGDOLL', confirm: '改造 · 50 金币' });
    expect(all('[role="radiogroup"]').map((row) => row.dataset.item)).toEqual([
      'colour',
      'pattern',
      'white',
      'eyes',
      'face',
    ]);
    expect(text('#cat-maker-confirm')).toBe('改造 · 50 金币');
  });

  it('marks the chosen option of each row and draws the choice, body and all, above', () => {
    open();
    expect(checked()).toEqual({ breed: 'DOMESTIC', ...PLAIN });
    expect(all('[aria-checked="true"]')).toHaveLength(6);
    // The preview is the petting screen's cat: its paws show mittens, its back a cow's patches.
    expect(preview()).toBe(petted('DOMESTIC', PLAIN));
    click('#cat-maker [data-item="colour"][data-option="black"]');
    click('#cat-maker [data-item="white"][data-option="mittens"]');
    click('#cat-maker [data-item="breed"][data-option="RAGDOLL"]');
    const chosen = { ...PLAIN, colour: 'black', white: 'mittens' } as const;
    expect(checked()).toEqual({ breed: 'RAGDOLL', ...chosen });
    expect(radio('colour', 'cream').getAttribute('aria-checked')).toBe('false');
    expect(preview()).toBe(petted('RAGDOLL', chosen));
  });

  it('🎲 picks the breed and all five from the injected source, the same each time, and sends nothing', () => {
    const randoms = [0.99, 0.5, 0.4, 0.99, 0.34, 0.7];
    const { game } = open({}, randoms);
    const world = game.world();
    const command = game.session.lastCommand();
    const made = {
      colour: 'cream',
      pattern: 'tabby',
      white: 'bicolour',
      eyes: 'copper',
      face: 'long',
    } as const;
    click('#cat-maker-random');
    expect(checked()).toEqual({ breed: 'BRITISH_SHORTHAIR', ...made });
    expect(preview()).toBe(petted('BRITISH_SHORTHAIR', made));
    // The source starts over: the same numbers make the same cat.
    click('#cat-maker [data-item="face"][data-option="round"]');
    click('#cat-maker-random');
    expect(checked()).toEqual({ breed: 'BRITISH_SHORTHAIR', ...made });
    expect(game.world()).toBe(world);
    expect(game.session.lastCommand()).toBe(command);
  });

  it('keeps the breed when it may not be picked: 🎲 draws only the five', () => {
    const { done } = open(
      { pickBreed: false, breed: 'RAGDOLL' },
      [0, 0.2, 0.4, 0.6, 0.8],
    );
    click('#cat-maker-random');
    click('#cat-maker-confirm');
    expect(done).toHaveBeenCalledExactlyOnceWith({
      breed: 'RAGDOLL',
      appearance: {
        colour: 'black',
        pattern: 'solid',
        white: 'bib',
        eyes: 'copper',
        face: 'long',
      },
    });
  });

  it('gives the choice on confirm, nothing on cancel or Escape, and goes away', () => {
    const { done } = open();
    click('#cat-maker [data-item="colour"][data-option="orange"]');
    click('#cat-maker-confirm');
    expect(done).toHaveBeenCalledExactlyOnceWith({
      breed: 'DOMESTIC',
      appearance: { ...PLAIN, colour: 'orange' },
    });
    expect(document.querySelector('#cat-maker')).toBeNull();

    const cancelled = mount();
    click('#cat-maker [data-item="colour"][data-option="orange"]');
    click('#cat-maker-cancel');
    expect(cancelled).toHaveBeenCalledExactlyOnceWith(null);
    expect(document.querySelector('#cat-maker')).toBeNull();

    const escaped = mount();
    key('keydown', 'Escape');
    expect(escaped).toHaveBeenCalledExactlyOnceWith(null);
    expect(document.querySelector('#cat-maker')).toBeNull();
  });

  it('goes through with the keyboard alone: arrows choose in a row, Tab goes round, Enter confirms', () => {
    const { done } = open();
    // Focus starts on the first row's choice; each row is one Tab stop.
    expect(document.activeElement).toBe(radio('breed', 'DOMESTIC'));
    key('keydown', 'ArrowRight');
    expect(document.activeElement).toBe(radio('breed', 'RAGDOLL'));
    key('keydown', 'Tab');
    expect(document.activeElement).toBe(radio('colour', 'cream'));
    key('keydown', 'ArrowLeft');
    key('keydown', 'Tab');
    key('keydown', 'ArrowDown');
    key('keydown', 'Tab');
    key('keydown', 'Tab');
    key('keydown', 'ArrowUp');
    key('keydown', 'Tab');
    // The last option goes round to the first.
    key('keydown', 'ArrowRight');
    key('keydown', 'ArrowRight');
    key('keydown', 'ArrowRight');
    expect(document.activeElement).toBe(radio('face', 'round'));
    expect(checked()).toEqual({
      breed: 'RAGDOLL',
      colour: 'orange',
      pattern: 'tabby',
      white: 'none',
      eyes: 'green',
      face: 'round',
    });
    for (const id of ['random', 'cancel', 'confirm']) {
      key('keydown', 'Tab');
      expect(document.activeElement).toBe($(`#cat-maker-${id}`));
    }
    // The screen holds the focus: past the last stop is the first, and back.
    key('keydown', 'Tab');
    expect(document.activeElement).toBe(radio('breed', 'RAGDOLL'));
    key('keydown', 'Tab', true);
    expect(document.activeElement).toBe($('#cat-maker-confirm'));
    key('keydown', 'Enter');
    expect(done).toHaveBeenCalledExactlyOnceWith({
      breed: 'RAGDOLL',
      appearance: {
        colour: 'orange',
        pattern: 'tabby',
        white: 'none',
        eyes: 'green',
        face: 'round',
      },
    });
  });

  it('keeps every button while the city clock runs', () => {
    const { game } = open();
    const buttons = all('button');
    expect(buttons.length).toBe(3 + 6 + 3 + 5 + 3 + 3 + 3);
    for (let tick = 0; tick < 5; tick++)
      expect(
        game.session.execute({ type: 'ADVANCE_TIME', minutes: 10 }).ok,
      ).toBe(true);
    const after = all('button');
    expect(after).toHaveLength(buttons.length);
    after.forEach((button, i) => expect(button).toBe(buttons[i]));
    expect(buttons.every((button) => button.isConnected)).toBe(true);
  });
});
