import { describe, expect, it, vi } from 'vitest';
import { $, click, openGame, text, visible } from '../helpers/view-rig';
import {
  catchFish,
  closeRiverPanel,
  enterRiver,
  openCats,
  showBagFish,
} from '../helpers/view-player';
import { BOND, BOND_LEVELS } from '../../src/content/care';
import { gameDay } from '../../src/core/bond';
import { createWorld, World } from '../../src/core/world';
import { finishFishing } from '../unit/fishing-fixture';

/** Thresholds are tuning: the second level's comes from the content table. */
const [, second, third] = BOND_LEVELS;
const short = second.bond - 1;

/** A world one shared moment short of the second level, as a save could hold it. */
function almostFamiliar() {
  const state = createWorld(42).getSnapshot();
  state.cats[0]!.playerBond = short;
  return { 'cat-city.save.v1': new World(state).save() };
}
const say = async (selector: string) => {
  click(selector);
  await vi.advanceTimersByTimeAsync(0);
};
const bar = () => $<HTMLProgressElement>('#bond-progress');

describe('bond level in the cats panel (spec 036)', () => {
  it('shows the level, hearts and progress of the selected cat', () => {
    openGame({ storage: almostFamiliar() });
    openCats('roster');
    expect(text('[data-cat-id="mochi"] .bond-line')).toBe('♡♡♡♡ 初识');
    openCats('talk');
    expect(visible('#bond-level')).toBe(true);
    expect(text('#bond-name')).toBe('初识');
    expect(text('#bond-hearts')).toBe('♡♡♡♡');
    expect(text('#bond-next')).toBe('距「熟悉」还差 1');
    expect([bar().value, bar().max]).toEqual([short, second.bond]);
    expect($('#bond-level').getAttribute('aria-label')).toBe(
      '关系：初识，距「熟悉」还差 1',
    );
    expect(text('#cats-page-talk')).not.toContain('慢慢熟悉中');
  });

  it('a chat that reaches a level says so once; a reload does not repeat it', async () => {
    const game = openGame({ storage: almostFamiliar() });
    openCats('talk');
    await say('[data-message="今天很开心"]');
    expect(game.world().cats[0]!.playerBond).toBe(second.bond);
    expect(text('#notice')).toBe(
      'Mochi 轻轻动了动耳朵，回应了你。和 Mochi 更熟了：熟悉。',
    );
    // The notice fades; the panel says it too, and keeps it.
    expect(visible('#bond-news')).toBe(true);
    expect(text('#bond-news')).toBe('和 Mochi 更熟了：熟悉');
    expect(text('#bond-name')).toBe('熟悉');
    expect(text('#bond-hearts')).toBe('♥♡♡♡');
    expect([bar().value, bar().max]).toEqual([0, third.bond - second.bond]);
    await say('[data-message="今天有点累"]');
    expect(text('#notice')).toBe('Mochi 轻轻动了动耳朵，回应了你。');
    expect(visible('#bond-news')).toBe(false);
    game.reload();
    expect(text('#notice')).not.toContain('更熟了');
    openCats('talk');
    expect(text('#bond-name')).toBe('熟悉');
    expect(visible('#bond-news')).toBe(false);
  });

  it('a shared catch that reaches a level says so with the result, a gift after it does not', () => {
    const game = openGame({ storage: almostFamiliar() });
    enterRiver(game);
    closeRiverPanel();
    click('#cast-start');
    catchFish(game);
    expect(game.world().cats[0]!.playerBond).toBe(short + BOND.catch);
    expect(text('#fish-result')).toContain('和 Mochi 更熟了：熟悉。');
    expect(text('#catch-reveal')).toContain('和 Mochi 更熟了：熟悉');
    const fish = game.world().fishing.inventory[0]!;
    showBagFish(game, fish.id);
    click(`[data-gift-fish="${fish.id}"]`);
    expect(game.world().cats[0]!.fishGift).not.toBeNull();
    expect(text('#notice')).not.toContain('更熟了');
    game.reload();
    expect(text('#notice')).not.toContain('更熟了');
    expect(text('#fish-result')).not.toContain('更熟了');
  });

  it('a gift that reaches a level says so in its notice', () => {
    // A fish caught through Core, then the bond one short of the level.
    const played = createWorld(42);
    played.dispatch({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      spotId: 'POND',
      baitId: 'BREAD',
      direction: -30,
      aimDepth: 50,
    });
    finishFishing(played);
    const state = played.getSnapshot();
    // A calm cat: a happy one would earn one more.
    Object.assign(state.cats[0]!, { playerBond: short, mood: 50 });
    const next = openGame({
      storage: { 'cat-city.save.v1': new World(state).save() },
    });
    const fish = next.world().fishing.inventory[0]!;
    enterRiver(next);
    showBagFish(next, fish.id);
    click(`[data-gift-fish="${fish.id}"]`);
    expect(next.world().cats[0]!.playerBond).toBe(short + BOND.favoriteGift);
    expect(text('#notice')).toContain('和 Mochi 更熟了：熟悉。');
  });

  it('a gift past the day’s three is taken kindly and changes neither bond nor mood', () => {
    const played = createWorld(42);
    played.dispatch({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      spotId: 'POND',
      baitId: 'BREAD',
      direction: -30,
      aimDepth: 50,
    });
    finishFishing(played);
    const state = played.getSnapshot();
    Object.assign(state.cats[0]!, {
      mood: 50,
      giftBond: { day: gameDay(state.minute), count: BOND.giftsPerDay },
    });
    const game = openGame({
      storage: { 'cat-city.save.v1': new World(state).save() },
    });
    const before = game.world().cats[0]!;
    const fish = game.world().fishing.inventory[0]!;
    enterRiver(game);
    showBagFish(game, fish.id);
    click(`[data-gift-fish="${fish.id}"]`);
    const after = game.world();
    expect(after.fishing.inventory).toHaveLength(0);
    expect(after.cats[0]!.fishGift!.fishId).toBe(fish.id);
    expect(after.cats[0]!.playerBond).toBe(before.playerBond);
    expect(after.cats[0]!.mood).toBe(before.mood);
    expect(text('#notice')).toBe(
      'Mochi 今天已经吃饱啦，这条先收下，明天再好好谢你。',
    );
  });
});
