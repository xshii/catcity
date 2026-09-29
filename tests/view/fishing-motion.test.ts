import { describe, expect, it } from 'vitest';
import { FISHING } from '../../src/content/fishing';
import { SCREEN_COPY } from '../../src/view/fishing/screen';
import { DEFAULT_TUNING } from '../../src/view/motion/rod';
import {
  $,
  click,
  openGame,
  orient,
  spin,
  text,
  visible,
} from '../helpers/view-rig';
import {
  backToCity,
  closeRiverPanel,
  enterRiver,
  FLICK,
  followFish,
  inMotionRiver,
  lift,
  openGear,
  SEASONED,
  sensorsOn,
  swing,
  toBite,
} from '../helpers/view-player';

const G = FISHING.motion.gesture;
const hint = () => text('#motion-fishing-hint');

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

  it('players can switch back to the frozen button flow on this device', () => {
    const game = openGame({ storage: SEASONED });
    inMotionRiver(game);
    openGear(game, 'supplies');
    expect(text('#motion-mode-toggle')).toMatch(/体感 ✓/);
    click('#motion-mode-toggle');
    expect(text('#motion-mode-toggle')).toMatch(/按钮/);
    closeRiverPanel();
    expect(visible('#motion-fishing')).toBe(false);
    expect(visible('#scene-ready')).toBe(true);
    // The choice is remembered for this device.
    game.reload();
    expect(localStorage.getItem('cat-city.fishing-input')).toBe('buttons');
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
    click('#motion-calibrate');
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
    const precise = Math.round((band.min + band.max) / 2);
    pitch(precise);
    expect(meter.getAttribute('aria-valuetext')).toBe(
      `力度 ${precise}，精准区间 ${band.min}–${band.max}`,
    );
    // The green zone on the water says what a precise cast gives.
    expect(visible('#motion-precise')).toBe(true);
    expect(text('#motion-precise')).toBe(SCREEN_COPY.cast.legend);
    pitch(100);
    expect(meter.getAttribute('aria-valuenow')).toBe('100');
    // The cast reads the power from just before the flick: hold the tilt that long.
    game.wait(G.powerLeadMs * 2);
    swing();
    expect(game.world().fishing.active).toMatchObject({
      mode: 'motion',
      power: 100,
      precision: false,
    });
    // Said once: past the green, so no precise-cast bonus.
    expect(text('#notice')).toBe(
      SCREEN_COPY.cast.notice(100, SCREEN_COPY.cast.loose),
    );
    expect(visible('#motion-precise')).toBe(false);
  });

  it('a phone in button mode can switch to motion right from the river', () => {
    const game = openGame({ storage: SEASONED });
    inMotionRiver(game);
    openGear(game, 'supplies');
    click('#motion-mode-toggle');
    closeRiverPanel();
    expect(visible('#scene-ready')).toBe(true);
    // No digging in the gear panel: the ready area offers the way back.
    expect(text('#motion-quick')).toBe('改用体感钓鱼');
    click('#motion-quick');
    sensorsOn();
    expect(visible('#motion-fishing')).toBe(true);
    expect(visible('#motion-quick')).toBe(false);
  });

  it('a phone that has not chosen yet sees the motion card, not the manual cast', () => {
    const game = openGame({ phone: true, permission: 'granted' });
    enterRiver(game);
    closeRiverPanel();
    expect(visible('#motion-onboarding')).toBe(true);
    expect(visible('#scene-ready')).toBe(false);
    // Choosing buttons brings the manual cast back.
    click('#motion-use-buttons');
    expect(visible('#scene-ready')).toBe(true);
  });

  it('shows the calibrate button while motion is ready to aim, not over a calibration or a run', () => {
    const game = openGame({ storage: SEASONED });
    enterRiver(game);
    expect(visible('#motion-calibrate')).toBe(false);
    inMotionRiver(game);
    expect(visible('#motion-calibrate')).toBe(true);
    click('#motion-calibrate');
    expect(visible('#motion-calibrate')).toBe(false);
    expect(hint()).toBe(SCREEN_COPY.hint.calibrating);
    // No flicks: the window closes without a result and the button returns.
    game.wait(G.calibration.windowMs);
    expect(hint()).toBe(SCREEN_COPY.calibrate.failed);
    expect(visible('#motion-calibrate')).toBe(true);
    // Flicks just after calibrating still belong to it.
    game.wait(G.calibration.settleMs);
    swing();
    expect(game.world().fishing.active!.mode).toBe('motion');
    expect(visible('#motion-calibrate')).toBe(false);
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
});
