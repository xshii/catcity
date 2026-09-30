import { describe, expect, it, vi } from 'vitest';
import { FISHING } from '../../src/content/fishing';
import { fishShadows, shadowUnderCast } from '../../src/core';
import { SCREEN_COPY } from '../../src/view/fishing/screen';
import { DEFAULT_TUNING } from '../../src/view/motion/rod';
import {
  $,
  click,
  key,
  openGame,
  orient,
  pressEnter,
  spin,
  text,
  touchEnd,
  visible,
} from '../helpers/view-rig';
import {
  backToCity,
  closeSettings,
  enterRiver,
  FLICK,
  openCats,
  followFish,
  inMotionRiver,
  lift,
  openSettings,
  SEASONED,
  sensorsOn,
  swing,
  toBite,
} from '../helpers/view-player';

const G = FISHING.motion.gesture;
const hint = () => text('#motion-fishing-hint');
const pressed = (mode: 'motion' | 'buttons') =>
  $(`#settings-mode-${mode}`).getAttribute('aria-pressed') === 'true';
/** Both sensors asked for once, each inside the player's tap. */
const ASKED_IN_TAP = [
  { sensor: 'motion', inTap: true },
  { sensor: 'orientation', inTap: true },
];

describe('motion fishing', () => {
  it('swings to cast, lifts on "!", follows the fish, and leaves nothing behind', () => {
    const game = openGame({ storage: SEASONED });
    inMotionRiver(game);
    const before = game.world();
    expect(before.fishing.active).toBeNull();
    // A quick flick down starts and casts the run.
    swing();
    expect(game.world().fishing.active).toMatchObject({
      mode: 'motion',
      phase: 'waiting',
    });
    expect(game.world().cats[0]!.needs.energy).toBe(
      before.cats[0]!.needs.energy - FISHING.cast.staminaCost,
    );
    expect(hint()).toBe(SCREEN_COPY.hint.waiting);
    toBite(game);
    expect(visible('#motion-bite')).toBe(true);
    // A real bite comes long after the cast's rebound, which must not strike.
    game.wait(G.liftCooldownMs);
    lift();
    expect(game.world().fishing.active!.phase).toBe('fight');
    expect(visible('#motion-ring')).toBe(true);
    expect(visible('#motion-fish')).toBe(true);
    followFish(game);
    expect(game.world().fishing.lastResult!.caught).toBe(true);
    expect(text('#fish-result')).toContain('钓到了');
    expect(visible('#motion-ring')).toBe(false);
    backToCity();
  });

  it('the hooked fish looks nearer as the hold fills (spec 033 F1)', () => {
    const game = openGame({ storage: SEASONED });
    inMotionRiver(game);
    swing();
    toBite(game);
    game.wait(G.liftCooldownMs);
    lift();
    const near: number[] = [];
    followFish(game, () => {
      if (game.world().fishing.active?.phase !== 'fight') return;
      // The overlay scales the fish by how full the hold is: the progress bar's share.
      const shown = Number($('#motion-fish').style.getPropertyValue('--near'));
      const bar = $<HTMLProgressElement>('#motion-hold').value;
      expect(Math.abs(shown * 100 - bar)).toBeLessThanOrEqual(0.5);
      near.push(shown);
    });
    expect(game.world().fishing.lastResult!.caught).toBe(true);
    expect(Math.min(...near)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...near)).toBeLessThanOrEqual(1);
    expect(near.at(-1)!).toBeGreaterThan(near[0]! + 0.5);
  });

  it('players can switch back to the frozen button flow on this device', () => {
    const game = openGame({ storage: SEASONED });
    inMotionRiver(game);
    openSettings();
    expect(pressed('motion')).toBe(true);
    click('#settings-mode-buttons');
    expect(pressed('buttons')).toBe(true);
    expect(pressed('motion')).toBe(false);
    closeSettings();
    expect(visible('#motion-fishing')).toBe(false);
    expect(visible('#scene-ready')).toBe(true);
    // The choice is remembered for this device.
    game.reload();
    expect(localStorage.getItem('cat-city.fishing-input')).toBe('buttons');
    enterRiver(game);
    expect(visible('#scene-ready')).toBe(true);
    expect(pressed('buttons')).toBe(true);
  });

  it('the tilt aim survives the city clock refreshing the view', () => {
    const game = openGame({ storage: SEASONED });
    inMotionRiver(game);
    orient(-G.aimRangeDeg, 0);
    // Any session update (the city clock ticks every second) must keep the zero pose.
    game.session.execute({ type: 'ADVANCE_TIME', minutes: 1 });
    orient(-G.aimRangeDeg, 0);
    // The water preview follows the tilt before the cast.
    expect($<HTMLInputElement>('#fish-direction').value).toBe(
      String(-FISHING.input.maxDirection),
    );
    swing();
    expect(game.world().fishing.active!.direction).toBe(
      -FISHING.input.maxDirection,
    );
  });

  it('the petting screen over the river covers the rod: a swing casts nothing until it closes', () => {
    const game = openGame({ storage: SEASONED });
    inMotionRiver(game);
    openCats('roster');
    click('#pet-cat');
    expect(visible('#petting')).toBe(true);
    swing();
    expect(game.world().fishing.active).toBeNull();
    expect(game.session.lastCommand()?.command.type ?? 'none').not.toMatch(
      /^FISH_/,
    );
    click('#petting-close');
    swing();
    expect(game.world().fishing.active?.phase).toBe('waiting');
  });

  it('a paused motion run ignores gestures and says how to resume', () => {
    const game = openGame({ storage: SEASONED });
    inMotionRiver(game);
    swing();
    toBite(game);
    click('#fish-pause');
    expect(hint()).toContain('已暂停');
    lift();
    expect(game.world().fishing.active!.phase).toBe('hook');
    click('#fish-pause');
    lift();
    expect(game.world().fishing.active!.phase).toBe('fight');
  });

  it('tapping the water strikes when a lift cannot be sensed', () => {
    const game = openGame({ storage: SEASONED });
    inMotionRiver(game);
    swing();
    toBite(game);
    click('#motion-fishing');
    expect(game.world().fishing.active!.phase).toBe('fight');
  });

  it('a phone without orientation readings can still cast straight ahead', () => {
    const game = openGame({ storage: SEASONED });
    inMotionRiver(game, { orientation: false });
    swing();
    expect(game.world().fishing.active).toMatchObject({
      mode: 'motion',
      direction: 0,
    });
  });

  it('one-tap calibration lets a phone with a reversed pitch cast', () => {
    const game = openGame({ storage: SEASONED });
    inMotionRiver(game);
    const quiet = Array<number>(12).fill(0);
    const reversed = (rates: number[]) => spin(rates.map((rate) => -rate));
    // Before calibrating, the reversed flick is not a cast.
    reversed(FLICK);
    expect(game.world().fishing.active).toBeNull();
    openSettings();
    click('#settings-calibrate');
    expect(hint()).toContain('校准');
    for (const rates of [FLICK, quiet, FLICK, quiet]) {
      reversed(rates);
      // A flick ends after a quiet spell measured in event time, so let time pass.
      game.wait(G.calibration.quietMs + 50);
    }
    // The calibration window closes.
    game.wait(G.calibration.windowMs);
    expect(hint()).toContain('校准完成');
    expect(hint()).toContain('下甩 900');
    // Flicks just after calibrating still belong to it; after the settle, one casts.
    reversed(FLICK);
    expect(game.world().fishing.active).toBeNull();
    game.wait(G.calibration.settleMs);
    reversed(FLICK);
    expect(game.world().fishing.active).toMatchObject({
      mode: 'motion',
      phase: 'waiting',
    });
    // The reversed tuning is kept for this device, over the one it had.
    expect(
      JSON.parse(localStorage.getItem('cat-city.rod-tuning.v2')!),
    ).toMatchObject({ pitchSign: -DEFAULT_TUNING.pitchSign });
  });

  it('slow pitch sets the power the flick casts with', () => {
    const game = openGame({ storage: SEASONED });
    inMotionRiver(game);
    // The water shows the power as the landing arc (spec 033 F5); the meter reads it out.
    const meter = $('#motion-power');
    const band = FISHING.cast.precisionPower;
    // Tilt the tip forward slowly, then back into the precise band, then as far back as
    // the power range goes.
    const pitch = (power: number) => {
      for (let i = 0; i < 30; i++)
        orient(0, ((power - 50) / 50) * G.powerRangeDeg);
    };
    pitch(0);
    expect(meter.getAttribute('aria-valuenow')).toBe('0');
    // At either end the ring goes no further, and the meter says so.
    expect(meter.getAttribute('aria-valuetext')).toContain(
      SCREEN_COPY.power.limit.near,
    );
    const precise = Math.round((band.min + band.max) / 2);
    pitch(precise);
    expect(meter.getAttribute('aria-valuetext')).toBe(
      `力度 ${precise}，精准区间 ${band.min}–${band.max}`,
    );
    // No words over the water say what a green ring means (user, 2026-09-30).
    expect(document.querySelector('#motion-legend')).toBeNull();
    expect(document.body.textContent).not.toContain('落点圈变绿');
    pitch(100);
    expect(meter.getAttribute('aria-valuenow')).toBe('100');
    expect(meter.getAttribute('aria-valuetext')).toContain(
      SCREEN_COPY.power.limit.far,
    );
    // The cast reads the power from just before the flick: hold the tilt that long.
    game.wait(G.powerLeadMs * 2);
    swing();
    // Every motion cast is steady now, whatever its power (spec 033 F5b); the pitch alone
    // set how far it lands, here the farthest water.
    expect(game.world().fishing.active).toMatchObject({
      mode: 'motion',
      power: 100,
      aimDepth: 100,
      precision: true,
    });
  });

  it.each([true, false])(
    'a flick aimed onto a fish shadow (%s) lands on it and says so, and only then',
    (onShadow) => {
      const game = openGame({ storage: SEASONED });
      inMotionRiver(game);
      const world = game.world();
      const shadows = fishShadows(world, 'POND');
      // The pitch reaches every shadow head-on: the one farthest from the middle water.
      const target = shadows.reduce((far, shadow) =>
        Math.abs(shadow.reach - 50) > Math.abs(far.reach - 50) ? shadow : far,
      );
      const aim = onShadow
        ? {
            direction: 5 * Math.round(target.direction / 5),
            power: target.reach,
            aimDepth: target.reach,
          }
        : [-45, 0, 45]
            .flatMap((direction) =>
              [10, 50, 90].map((power) => ({
                direction,
                power,
                aimDepth: power,
              })),
            )
            .find((cast) => shadowUnderCast(world, 'POND', cast) === null)!;
      for (let i = 0; i < 30; i++)
        orient(
          (aim.direction / FISHING.input.maxDirection) * G.aimRangeDeg,
          ((aim.power - 50) / 50) * G.powerRangeDeg,
        );
      // The preview asks Core what the ring is over: green on a shadow, cream off it.
      const said = shadowUnderCast(world, 'POND', aim);
      expect(said !== null).toBe(onShadow);
      game.wait(G.powerLeadMs * 2);
      swing();
      expect(game.world().fishing.active).toMatchObject({
        mode: 'motion',
        ...aim,
        shadow: said?.speciesId ?? null,
      });
      expect(text('#notice') === SCREEN_COPY.cast.onShadow).toBe(onShadow);
    },
  );

  it('a phone fishes by motion by default: the tap that opens the river asks for its sensors, once', async () => {
    const game = openGame({
      phone: true,
      permission: 'granted',
      storage: SEASONED,
    });
    // No card to tap: asked inside the tap on 河畔 itself, and not before in the city.
    enterRiver(game);
    expect(game.sensorAsks).toEqual(ASKED_IN_TAP);
    await game.answer();
    sensorsOn();
    expect(visible('#motion-fishing')).toBe(true);
    expect(visible('#scene-ready')).toBe(false);
    // Later taps on the river never ask again, and nothing was chosen for the player.
    openSettings();
    closeSettings();
    expect(game.sensorAsks).toEqual(ASKED_IN_TAP);
    expect(localStorage.getItem('cat-city.fishing-input')).toBeNull();
  });

  it('a phone that refuses its sensors fishes with buttons, is told once, and can retry in the settings', async () => {
    const game = openGame({
      phone: true,
      permission: 'denied',
      storage: SEASONED,
    });
    enterRiver(game);
    await game.answer();
    expect(text('#notice')).toBe(SCREEN_COPY.permission.denied);
    expect(visible('#scene-ready')).toBe(true);
    expect(visible('#motion-fishing')).toBe(false);
    // The sheet says why; opening it did not ask again.
    openSettings();
    expect(pressed('buttons')).toBe(true);
    expect(text('#settings-mode-note')).toBe(SCREEN_COPY.settings.denied);
    expect(game.sensorAsks).toEqual(ASKED_IN_TAP);
    // "Motion" retries inside its own tap.
    click('#settings-mode-motion');
    expect(game.sensorAsks).toEqual([...ASKED_IN_TAP, ...ASKED_IN_TAP]);
    await game.answer();
    expect(pressed('buttons')).toBe(true);
    // Refused again: the sheet, which covers the message, says so in new words.
    expect(text('#settings-mode-note')).toBe(SCREEN_COPY.settings.deniedAgain);
    closeSettings();
    // Buttons still fish.
    click('#cast-start');
    expect(game.world().fishing.active!.mode).toBe('buttons');
  });

  it('without HTTPS a phone fishes with buttons, asks nothing, and the settings say why', () => {
    const game = openGame({
      phone: true,
      permission: 'granted',
      secure: false,
    });
    enterRiver(game);
    expect(game.sensorAsks).toEqual([]);
    expect(visible('#scene-ready')).toBe(true);
    expect(text('#notice')).not.toContain('体感');
    openSettings();
    expect(pressed('buttons')).toBe(true);
    expect($<HTMLButtonElement>('#settings-mode-motion').disabled).toBe(true);
    expect(text('#settings-mode-note')).toBe(SCREEN_COPY.settings.unsupported);
  });

  it('a phone in button mode switches to motion in the settings, asking inside that tap', async () => {
    const game = openGame({
      phone: true,
      permission: 'granted',
      storage: { ...SEASONED, 'cat-city.fishing-input': 'buttons' },
    });
    enterRiver(game);
    // Buttons by choice: entering asks nothing.
    expect(game.sensorAsks).toEqual([]);
    expect(visible('#scene-ready')).toBe(true);
    openSettings();
    click('#settings-mode-motion');
    expect(game.sensorAsks).toEqual(ASKED_IN_TAP);
    await game.answer();
    closeSettings();
    sensorsOn();
    expect(visible('#motion-fishing')).toBe(true);
    expect(visible('#scene-ready')).toBe(false);
    expect(localStorage.getItem('cat-city.fishing-input')).toBe('motion');
  });

  it('after a reload mid-run, the first tap on the river asks for the sensors again', async () => {
    const game = openGame({
      phone: true,
      permission: 'granted',
      storage: SEASONED,
    });
    enterRiver(game);
    await game.answer();
    sensorsOn();
    swing();
    expect(game.world().fishing.active!.mode).toBe('motion');
    game.reload();
    // The restored run brings back the river without a tap: nothing is asked yet.
    expect(visible('#motion-fishing')).toBe(true);
    expect(game.sensorAsks).toEqual(ASKED_IN_TAP);
    // A tap on the water, which iOS does not click through, asks inside it.
    touchEnd('#motion-fishing');
    expect(game.sensorAsks).toEqual([...ASKED_IN_TAP, ...ASKED_IN_TAP]);
  });

  it('a restored run asks on a tap on the paused river only: not on the gear, the tools, or while it plays', async () => {
    const game = openGame({
      phone: true,
      permission: 'granted',
      storage: SEASONED,
    });
    enterRiver(game);
    await game.answer();
    sensorsOn();
    swing();
    game.reload();
    expect(game.sensorAsks).toEqual(ASKED_IN_TAP);
    // The gear and the tools open over the river: their taps ask nothing.
    click('#settings-gear');
    expect(visible('#settings-sheet')).toBe(true);
    key('keydown', 'Escape');
    click('#river-tab-gear');
    expect(visible('#river-tools')).toBe(true);
    expect(game.sensorAsks).toEqual(ASKED_IN_TAP);
    game.reload();
    // Nor does resuming, or a tap on the water of the run that plays: it strikes.
    click('#fish-pause');
    toBite(game);
    touchEnd('#motion-fishing');
    click('#motion-fishing');
    expect(game.world().fishing.active!.phase).toBe('fight');
    expect(game.sensorAsks).toEqual(ASKED_IN_TAP);
    // Paused, a tap on the river asks.
    click('#fish-pause');
    touchEnd('#motion-fishing');
    expect(game.sensorAsks).toEqual([...ASKED_IN_TAP, ...ASKED_IN_TAP]);
  });

  it('listens for the asking tap on phones that must ask only, and no longer once asked', () => {
    const clicks = (spy: { mock: { calls: unknown[][] } }) =>
      spy.mock.calls
        .filter(([type]) => type === 'click')
        .map((call) => call[1]);
    // A desktop never asks by itself: it hears no taps.
    openGame({ storage: SEASONED });
    expect(clicks(vi.mocked(window.addEventListener))).toEqual([]);
  });

  it('stops listening for the asking tap once it has asked', () => {
    const clicks = (spy: { mock: { calls: unknown[][] } }) =>
      spy.mock.calls
        .filter(([type]) => type === 'click')
        .map((call) => call[1]);
    const game = openGame({
      phone: true,
      permission: 'granted',
      storage: SEASONED,
    });
    const heard = clicks(vi.mocked(window.addEventListener));
    expect(heard).toHaveLength(1);
    const removed = vi.spyOn(window, 'removeEventListener');
    enterRiver(game);
    expect(game.sensorAsks).toEqual(ASKED_IN_TAP);
    expect(clicks(removed)).toEqual(heard);
  });

  it('where the browser cannot say a touch is a gesture, only a click asks', async () => {
    const game = openGame({
      phone: true,
      permission: 'granted',
      userActivation: false,
      storage: SEASONED,
    });
    enterRiver(game);
    await game.answer();
    sensorsOn();
    swing();
    game.reload();
    // A touch may end a scroll: asking then would be refused, and read as a refusal.
    touchEnd('#motion-fishing');
    expect(game.sensorAsks).toHaveLength(2);
    click('#motion-fishing');
    expect(game.sensorAsks).toHaveLength(4);
  });

  it.each(['granted', 'denied'] as const)(
    'an answer (%s) that comes after the player chose buttons leaves them with buttons, without a word',
    async (permission) => {
      const game = openGame({ phone: true, permission, storage: SEASONED });
      enterRiver(game);
      expect(game.sensorAsks).toEqual(ASKED_IN_TAP);
      // The prompt is still up when the player picks buttons.
      openSettings();
      click('#settings-mode-buttons');
      closeSettings();
      await game.answer();
      expect(text('#notice')).not.toBe(SCREEN_COPY.permission.denied);
      const heard = vi
        .mocked(window.addEventListener)
        .mock.calls.map(([type]) => type);
      expect(heard).not.toContain('devicemotion');
      expect(heard).not.toContain('deviceorientation');
      expect(visible('#scene-ready')).toBe(true);
    },
  );

  it('a first calibration cut short by the settings starts again when they close', () => {
    // Never calibrated; the guide is done.
    const game = openGame({ storage: { 'cat-city.fishing-guide': 'done' } });
    inMotionRiver(game);
    expect(hint()).toBe(SCREEN_COPY.hint.calibrating);
    openSettings();
    closeSettings();
    expect(hint()).toBe(SCREEN_COPY.hint.calibrating);
    // It runs its whole window from there, then is over for good.
    game.wait(G.calibration.windowMs - 1);
    expect(hint()).toBe(SCREEN_COPY.hint.calibrating);
    game.wait(1);
    expect(hint()).toBe(SCREEN_COPY.calibrate.failed);
    openSettings();
    closeSettings();
    expect(hint()).not.toBe(SCREEN_COPY.hint.calibrating);
  });

  it('offers calibration in the settings while motion is ready to aim, not over a calibration or a run', () => {
    const game = openGame({ storage: SEASONED });
    enterRiver(game);
    openSettings();
    expect(visible('#settings-calibrate')).toBe(false);
    closeSettings();
    inMotionRiver(game);
    openSettings();
    expect(visible('#settings-calibrate')).toBe(true);
    click('#settings-calibrate');
    // The sheet closes, calibration starts on the water, and focus is back on the gear.
    expect(visible('#settings-sheet')).toBe(false);
    expect(document.activeElement).toBe($('#settings-gear'));
    expect(hint()).toBe(SCREEN_COPY.hint.calibrating);
    expect($('#settings-calibrate').hidden).toBe(true);
    // No flicks: the window closes without a result and calibration is offered again.
    game.wait(G.calibration.windowMs);
    expect(hint()).toBe(SCREEN_COPY.calibrate.failed);
    expect($('#settings-calibrate').hidden).toBe(false);
    // Flicks just after calibrating still belong to it.
    game.wait(G.calibration.settleMs);
    swing();
    expect(game.world().fishing.active!.mode).toBe('motion');
    openSettings();
    expect(visible('#settings-calibrate')).toBe(false);
  });

  it('the first-cast guide can be skipped for good', () => {
    // Calibrated before, but new to the guide.
    const game = openGame({
      storage: { 'cat-city.rod-tuning.v2': JSON.stringify(DEFAULT_TUNING) },
    });
    inMotionRiver(game);
    expect(hint()).toBe(SCREEN_COPY.guide.aim);
    click('#motion-guide-skip');
    expect(visible('#motion-guide-skip')).toBe(false);
    expect(hint()).toBe(SCREEN_COPY.hint.aim);
    expect(localStorage.getItem('cat-city.fishing-guide')).toBe('done');
    // Skipping never casts.
    expect(game.world().fishing.active).toBeNull();
  });

  it('shows the aim hint once per device; a tap closes it for good (user, 2026-09-30)', () => {
    const game = openGame({ storage: SEASONED });
    inMotionRiver(game);
    expect(hint()).toBe(SCREEN_COPY.hint.aim);
    expect($('#motion-hint-close').getAttribute('aria-label')).toBe(
      SCREEN_COPY.hint.close,
    );
    click('#motion-hint-close');
    expect(hint()).toBe('');
    expect(visible('#motion-hint-close')).toBe(false);
    // Closing never casts; the device remembers.
    expect(game.world().fishing.active).toBeNull();
    game.reload();
    inMotionRiver(game);
    expect(hint()).toBe('');
  });

  it('closes the aim hint from the keyboard', () => {
    const game = openGame({ storage: SEASONED });
    inMotionRiver(game);
    pressEnter('#motion-hint-close');
    expect(hint()).toBe('');
    expect(localStorage.getItem('cat-city.aim-hint')).toBe('seen');
  });

  it('a cast sees the aim hint: the next aim has none', () => {
    const game = openGame({ storage: SEASONED });
    inMotionRiver(game);
    expect(visible('#motion-hint-close')).toBe(true);
    swing();
    expect(hint()).toBe(SCREEN_COPY.hint.waiting);
    click('#fish-cancel');
    expect(game.world().fishing.active).toBeNull();
    expect(visible('#motion-fishing')).toBe(true);
    expect(hint()).toBe('');
    expect(visible('#motion-hint-close')).toBe(false);
  });
});
