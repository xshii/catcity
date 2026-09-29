import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { FISHING } from '../../src/content/fishing';
import { DEFAULT_TUNING } from '../../src/view/motion/rod';

/**
 * A phone in a real browser for motion fishing (spec 034): a coarse touch pointer, and
 * sensor permission asked as iOS Safari does. Chromium and WebKit expose the sensor
 * events but never fire them, so tests fire synthetic readings.
 */

/** A sensor permission request: which sensor, and whether it came inside a user gesture. */
export interface SensorAsk {
  sensor: string;
  inGesture: boolean | null;
}

/**
 * A phone at this size: touch and a coarse pointer. Not `isMobile`: WebKit's mobile
 * emulation reports a portrait page at screen angle 90°, which turns every tilt sideways.
 */
export const phoneContext = (
  browser: Browser,
  viewport = { width: 390, height: 844 },
) => browser.newContext({ viewport, hasTouch: true });

/**
 * Sensors that ask first, as on iOS, answered `answer`; every request records whether the
 * browser counted it inside a user gesture (`navigator.userActivation.isActive`).
 */
export const askForSensors = (
  context: BrowserContext,
  answer: 'granted' | 'denied' = 'granted',
) =>
  context.addInitScript((answer) => {
    const asks: SensorAsk[] = [];
    const page = window as unknown as Record<string, unknown>;
    page.sensorAsks = asks;
    for (const sensor of ['DeviceMotionEvent', 'DeviceOrientationEvent'])
      Object.defineProperty(page[sensor], 'requestPermission', {
        configurable: true,
        value: () => {
          const { userActivation } = navigator as {
            userActivation?: { isActive: boolean };
          };
          asks.push({ sensor, inGesture: userActivation?.isActive ?? null });
          return Promise.resolve(answer);
        },
      });
  }, answer);

/** The sensor permission requests this page load made. */
export const sensorAsks = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { sensorAsks: SensorAsk[] }).sensorAsks,
  );

/** Both sensors asked for once, each inside the player's gesture. */
export const ASKED_IN_GESTURE: SensorAsk[] = [
  { sensor: 'DeviceMotionEvent', inGesture: true },
  { sensor: 'DeviceOrientationEvent', inGesture: true },
];

/**
 * A device that finished the first-cast guide and calibrated before (spec 033 F3), so
 * tests drive the rod directly. Written before every load of the page.
 */
export const seasoned = (target: Page | BrowserContext) =>
  target.addInitScript((tuning) => {
    localStorage.setItem('cat-city.fishing-guide', 'done');
    localStorage.setItem('cat-city.rod-tuning.v2', tuning);
  }, JSON.stringify(DEFAULT_TUNING));

/** A tilt reading. */
export async function orient(page: Page, gamma: number, beta: number) {
  await page.evaluate(
    (pose) => {
      const event = new Event('deviceorientation');
      Object.defineProperties(event, {
        gamma: { value: pose.gamma },
        beta: { value: pose.beta },
      });
      window.dispatchEvent(event);
    },
    { gamma, beta },
  );
}

/** Gyroscope readings, one event per rate, in °/s of pitch. */
export async function spin(page: Page, rates: number[]) {
  await page.evaluate(
    ({ rates, sign }) => {
      for (const rate of rates) {
        const event = new Event('devicemotion');
        Object.defineProperty(event, 'rotationRate', {
          value: { alpha: 0, beta: rate * sign, gamma: 0 },
        });
        window.dispatchEvent(event);
      }
    },
    { rates, sign: FISHING.motion.gesture.pitchSign },
  );
}

/** Permission answers arrive as a promise: feed samples until the game hears them. */
export async function sensorsOn(page: Page, withOrientation = true) {
  await expect
    .poll(async () => {
      if (withOrientation) await orient(page, 0, 0);
      await spin(page, [0]);
      return page.locator('#settings-mode-motion').getAttribute('aria-pressed');
    })
    .toBe('true');
}
