import { describe, expect, it } from 'vitest';
import { CARE } from '../../src/content/care';
import { FISHING } from '../../src/content/fishing';
import { $, click, key, openGame, text, visible } from '../helpers/view-rig';
import { SCREEN_COPY } from '../../src/view/fishing/screen';
import {
  backToCity,
  castOnce,
  catchFish,
  closeRiverPanel,
  closeSettings,
  enterRiver,
  meter,
  openCats,
  openGear,
  openSettings,
} from '../helpers/view-player';

/** The notice bar is not kept from showing (happy-dom misreads the bar's `:empty` rule). */
const noticeShows = () =>
  getComputedStyle($('#notice')).visibility !== 'hidden';

/** The words a screen reader reads for an element: its text, less what is hidden from it. */
function spoken(element: Element) {
  const copy = element.cloneNode(true) as Element;
  copy
    .querySelectorAll('[hidden], [aria-hidden="true"]')
    .forEach((node) => node.remove());
  return copy.textContent ?? '';
}

describe('the button flow', () => {
  it('enters the river, casts, strikes, reels in, and leaves nothing behind', () => {
    const game = openGame();
    enterRiver(game);
    expect(visible('#cast-start')).toBe(true);
    expect(visible('#motion-fishing')).toBe(false);
    const arrival = game.world();
    click('#cast-start');
    expect(visible('#fish-control')).toBe(true);
    catchFish(game);
    const landed = game.world();
    expect(landed.fishing.inventory).toHaveLength(1);
    expect(landed.cats[0]!.needs.energy).toBe(
      arrival.cats[0]!.needs.energy - FISHING.cast.staminaCost,
    );
    expect(text('#catch-reveal')).toContain('银鱼');
    expect(visible('#cast-start')).toBe(true);
    backToCity();
  });

  it('shows the catch card for a catch made on this visit, not one from the save', () => {
    const game = openGame();
    enterRiver(game);
    click('#cast-start');
    catchFish(game);
    expect(visible('#catch-reveal')).toBe(true);
    // Back from the city, or after a reload, the saved catch is not "this" one.
    backToCity();
    enterRiver(game);
    expect(game.world().fishing.lastResult?.caught).toBe(true);
    expect(visible('#catch-reveal')).toBe(false);
    game.reload();
    enterRiver(game);
    expect(visible('#catch-reveal')).toBe(false);
  });

  it('the catch card withdraws the standing notice, and gives way to a later one', () => {
    const game = openGame();
    enterRiver(game);
    expect(noticeShows()).toBe(true);
    click('#cast-start');
    expect(noticeShows()).toBe(true);
    catchFish(game);
    expect(visible('#catch-reveal')).toBe(true);
    expect(noticeShows()).toBe(false);
    // A notice raised while the card shows is never lost: the card goes.
    openGear(game, 'supplies');
    click('[data-buy-bait="WORM"]');
    expect(text('#notice')).toBe('鱼饵已放进包里。');
    expect(noticeShows()).toBe(true);
    closeRiverPanel();
    expect(noticeShows()).toBe(true);
    expect(visible('#catch-reveal')).toBe(false);
    // The catch itself stays in the tools' result line.
    expect(text('#fish-result')).toContain('钓到了');
  });

  it('the next cast takes the catch card away and says its own notice', () => {
    const game = openGame();
    enterRiver(game);
    click('#cast-start');
    catchFish(game);
    expect(visible('#catch-reveal')).toBe(true);
    click('#cast-start');
    expect(visible('#catch-reveal')).toBe(false);
    expect(text('#notice')).toBe('落点已锁定，按住按钮蓄力，松开抛竿。');
    expect(noticeShows()).toBe(true);
    catchFish(game);
    expect(visible('#catch-reveal')).toBe(true);
    expect(noticeShows()).toBe(false);
  });

  it('a manual fishing clock advances exactly the stepped ticks and respects pause', () => {
    const game = openGame();
    enterRiver(game);
    closeRiverPanel();
    click('#cast-start');
    // A new run waits for the player's first press before any tick runs.
    expect(game.tick(5)).toBe(0);
    $('#fish-control').focus();
    key('keydown', 'Space');
    const start = game.world().fishing.active!;
    // Real time passes, but no fishing tick runs without a step.
    game.wait(300);
    expect(game.world().fishing.active).toEqual(start);
    expect(game.tick(5)).toBe(5);
    expect(game.world().fishing.active!.tick).toBe(start.tick + 5);
    click('#fish-pause');
    expect(game.tick(5)).toBe(0);
    expect(game.tick(0)).toBe(0);
    expect(game.world().fishing.active!.tick).toBe(start.tick + 5);
    click('#fish-pause');
    key('keyup', 'Space');
    game.realFishingClock();
    game.wait(250);
    expect(game.world().fishing.active!.tick).toBeGreaterThan(start.tick + 5);
  });

  it('real fishing inputs trigger optional haptics; switching it off stops further pulses', () => {
    const game = openGame();
    enterRiver(game);
    openSettings();
    expect(text('#haptics-toggle')).toBe('震动：开');
    closeSettings();
    click('#cast-start');
    catchFish(game);
    expect(text('#catch-reveal')).toContain('银鱼');
    expect(game.vibrations).toEqual([[12, 35, 12], 25, [30, 45, 55]]);
    openSettings();
    click('#haptics-toggle');
    expect(text('#haptics-toggle')).toBe('震动：关');
    const disabled = [...game.vibrations];
    expect(disabled.at(-1)).toBe(0);
    closeSettings();
    click('#cast-start');
    $('#fish-control').focus();
    key('keydown', 'Space');
    game.until(() => meter().value >= 60, 80);
    key('keyup', 'Space');
    game.until(() => meter().phase === 'hook', 160);
    // Deliberately strike outside the visible green zone to exercise failure feedback.
    game.until(() => {
      const { value, low, high } = meter();
      return value < low - 8 || value > high + 8;
    }, 160);
    key('keydown', 'Space');
    game.until(() => !visible('#angling-live'), 5);
    key('keyup', 'Space');
    expect(game.vibrations).toEqual(disabled);
    expect(game.world().fishing.lastResult!.caught).toBe(false);
  });

  it('browsers without vibration shake the river on a bite instead and do not change gameplay', () => {
    const game = openGame({ vibration: false });
    enterRiver(game);
    openSettings();
    expect($<HTMLButtonElement>('#haptics-toggle').disabled).toBe(false);
    expect(text('#haptics-toggle')).toBe('画面反馈：开');
    closeSettings();
    const before = game.world();
    click('#cast-start');
    expect(visible('#fish-control')).toBe(true);
    // Preparing is free; stamina is paid when the cast is released.
    expect(game.world().cats[0]!.needs.energy).toBe(
      before.cats[0]!.needs.energy,
    );
    castOnce(game);
    // Step to the bite and read the stage on that very tick.
    game.until(() => game.world().fishing.active?.phase === 'hook', 1000);
    expect($('#fishing-stage').classList.contains('screen-shake')).toBe(true);
  });

  it('sound starts with the first gesture, a cast plays it, and switching it off is remembered', () => {
    const game = openGame({ audio: true });
    expect(game.audio).toEqual({ contexts: 0, starts: 0 });
    enterRiver(game);
    openSettings();
    expect(text('#sound-toggle')).toBe('音效：开');
    closeSettings();
    expect(game.audio).toEqual({ contexts: 1, starts: 0 });
    click('#cast-start');
    castOnce(game);
    expect(game.audio.starts).toBeGreaterThan(0);

    openSettings();
    click('#sound-toggle');
    expect(text('#sound-toggle')).toBe('音效：关');
    expect($('#sound-toggle').getAttribute('aria-pressed')).toBe('false');
    game.reload();
    enterRiver(game);
    openSettings();
    expect(text('#sound-toggle')).toBe('音效：关');
    // Gestures no longer start any audio while sound is off.
    expect(game.audio).toEqual({ contexts: 0, starts: 0 });
  });

  it('the gear opens the settings; ✕, a tap outside or Escape closes them and focus returns', () => {
    const game = openGame();
    enterRiver(game);
    expect(visible('#river-settings')).toBe(true);
    expect($('#river-settings').getAttribute('aria-label')).toBe('设置');
    for (const close of [
      () => click('#river-settings-close'),
      () => click('#river-settings-shade'),
      () => key('keydown', 'Escape'),
    ]) {
      openSettings();
      expect($('#river-settings').getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe($('#river-settings-close'));
      close();
      expect(visible('#river-settings-sheet')).toBe(false);
      expect($('#river-settings').getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe($('#river-settings'));
    }
    // The gear and its sheet are the river's alone.
    backToCity();
  });

  it('the open settings are modal: Tab goes round their controls', () => {
    const game = openGame({ audio: true });
    enterRiver(game);
    openSettings();
    expect($('#river-settings-sheet').getAttribute('aria-modal')).toBe('true');
    const stops = [
      '#river-settings-close',
      '#settings-mode-motion',
      '#settings-mode-buttons',
      '#sound-toggle',
      '#haptics-toggle',
    ];
    // Forward from the ✕ through every control and round to it; calibration is hidden.
    for (const next of [...stops.slice(1), stops[0]!]) {
      key('keydown', 'Tab');
      expect(document.activeElement?.id).toBe(next.slice(1));
    }
    key('keydown', 'Tab', true);
    expect(document.activeElement).toBe($(stops.at(-1)!));
    // Closed, Tab is the page's again.
    closeSettings();
    key('keydown', 'Tab');
    expect(document.activeElement).toBe($('#river-settings'));
  });

  it('a run keeps its mode: the settings lock the choice and say why, and pause the run', () => {
    const game = openGame();
    enterRiver(game);
    click('#cast-start');
    castOnce(game);
    openSettings();
    for (const mode of ['motion', 'buttons'])
      expect($<HTMLButtonElement>(`#settings-mode-${mode}`).disabled).toBe(
        true,
      );
    expect($('#settings-mode-buttons').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(text('#settings-mode-note')).toBe(SCREEN_COPY.settings.runLocked);
    // The sheet covers the water: the run waits.
    const run = game.world().fishing.active!;
    expect(game.tick(5)).toBe(0);
    expect(game.world().fishing.active).toEqual(run);
    // Sound and haptics still switch mid-run.
    click('#haptics-toggle');
    expect(text('#haptics-toggle')).toBe('震动：关');
    closeSettings();
    expect(text('#fish-pause')).toBe(SCREEN_COPY.pause.resume);
    click('#fish-cancel');
    openSettings();
    expect($<HTMLButtonElement>('#settings-mode-motion').disabled).toBe(false);
    // This desktop wants motion but its sensors never report: the sheet says so.
    expect(text('#settings-mode-note')).toBe(SCREEN_COPY.settings.waiting);
  });

  it('the gear panel keeps bait supplies only; the settings moved to the gear over the water', () => {
    const game = openGame();
    enterRiver(game);
    openGear(game, 'supplies');
    expect(text('#gear-tab-supplies')).toBe('补充');
    expect(visible('[data-buy-bait="WORM"]')).toBe(true);
    const gear = $('#river-panel-gear');
    for (const id of [
      '#sound-toggle',
      '#haptics-toggle',
      '#settings-mode-motion',
    ])
      expect(gear.querySelector(id)).toBeNull();
    // The gear over the water is under the panel's shade while it is open.
    expect(visible('#river-settings-sheet')).toBe(false);
  });

  it('city clock updates preserve the focused cat card and render fixture names literally', () => {
    const game = openGame();
    const advanceTime = (minutes: number) =>
      game.session.execute({ type: 'ADVANCE_TIME', minutes });
    enterRiver(game);
    // The roster lives in the cats panel; the city clock still runs while it is open.
    openCats();
    const card = $('[data-cat-id="mochi"]');
    card.focus();
    advanceTime(1);
    expect(document.activeElement).toBe(card);
    expect(card.isConnected).toBe(true);
    // A pond-shore spawn arrives at full energy; spend a cast so it has something to recover.
    closeRiverPanel();
    click('#cast-start');
    castOnce(game);
    click('#fish-cancel');
    const tired = game.world().cats[0]!.needs.energy;
    expect(tired).toBeLessThan(100);
    // At the river the companion stays awake (R-01); in the city it dozes while recovering.
    backToCity();
    openCats();
    card.focus();
    advanceTime(10);
    expect(document.activeElement).toBe(card);
    // The curled portrait shows it; screen readers hear the words.
    expect(visible('[data-cat-id="mochi"] .rest-label')).toBe(true);
    expect(text('[data-cat-id="mochi"] .rest-label')).toBe('在休息');
    expect($<HTMLProgressElement>('[data-cat-id="mochi"] progress').value).toBe(
      tired + CARE.recovery.idle,
    );
    const name = 'Mochi <b>你好</b>';
    const save = JSON.parse(localStorage.getItem('cat-city.save.v1')!);
    save.world.cats[0].name = name;
    game.session.loadFixture(JSON.stringify(save));
    expect(text('[data-cat-id="mochi"] strong')).toBe(name);
    expect(card.querySelectorAll('strong b')).toHaveLength(0);
    expect(card.isConnected).toBe(true);
  });

  it('the cat fishing with the player stays awake at the river after a cast, and dozes in the city (R-01)', () => {
    const game = openGame();
    enterRiver(game);
    click('#cast-start');
    catchFish(game);
    expect(visible('#catch-reveal')).toBe(true);
    // Idle and recovering: in the city this cat would doze.
    expect(game.world().fishing.active).toBeNull();
    expect(game.world().cats[0]!.needs.energy).toBeLessThan(100);
    openCats();
    const card = $('[data-cat-id="mochi"]');
    expect(spoken(card)).toContain('Mochi');
    expect(spoken(card)).not.toContain('在休息');
    // The city clock runs on at the river: the same card, still awake.
    for (let minute = 0; minute < 5; minute++)
      game.session.execute({ type: 'ADVANCE_TIME', minutes: 1 });
    expect($('[data-cat-id="mochi"]')).toBe(card);
    expect(spoken(card)).not.toContain('在休息');
    closeRiverPanel();
    backToCity();
    expect(game.world().cats[0]!.needs.energy).toBeLessThan(100);
    openCats();
    expect(spoken(card)).toContain('在休息');
  });

  it('leaving the river gives up an uncast rod, but keeps a cast one to come back to', () => {
    const game = openGame();
    enterRiver(game);
    const arrival = game.world();
    click('#cast-start');
    expect(game.world().fishing.active?.phase).toBe('charge');
    click('#visit-city');
    // Nothing was paid, and the cat is free to recover.
    const left = game.world();
    expect(left.fishing.active).toBeNull();
    expect(left.cats[0]!.needs.energy).toBe(arrival.cats[0]!.needs.energy);
    enterRiver(game);
    click('#cast-start');
    castOnce(game);
    click('#visit-city');
    expect(game.world().fishing.active?.phase).not.toBe('charge');
    expect(game.world().fishing.active).not.toBeNull();
  });
});
