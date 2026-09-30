import { CITY_TIME } from '../../content/city';
import { readPref, savePref } from '../../platform/local-prefs';
import type { PlaceState } from './place';

export type ClockSpeed = (typeof CITY_TIME.speeds)[number];
/** Per-device choice; never part of the world or a save. */
const SPEED_KEY = 'cat-city.clock-speed';
const [NORMAL] = CITY_TIME.speeds;

/** One tap moves to the next speed and wraps back to 1×. */
export const nextClockSpeed = (speed: ClockSpeed): ClockSpeed =>
  CITY_TIME.speeds[
    (CITY_TIME.speeds.indexOf(speed) + 1) % CITY_TIME.speeds.length
  ]!;

/** `storage` is a getter: with site data blocked, touching `localStorage` itself throws. */
export function readClockSpeed(
  storage: () => Pick<Storage, 'getItem'>,
): ClockSpeed {
  const stored = readPref(SPEED_KEY, storage);
  return CITY_TIME.speeds.find((speed) => String(speed) === stored) ?? NORMAL;
}

/**
 * The speed button beside the city clock. Minigames (the river, petting) run at 1× and
 * lock it; leaving one keeps 1× until the player taps again. Returns game minutes per
 * real second.
 */
export function mountClockSpeed(place: PlaceState, button: HTMLButtonElement) {
  let speed = readClockSpeed(() => localStorage);
  const render = () => {
    const locked = place.minigame();
    const game = place.get() === 'river' ? '钓鱼' : '撸猫';
    button.disabled = locked;
    button.textContent = locked ? `${game} ${speed}×` : `速度 ${speed}×`;
    button.title = locked ? `${game}时按正常速度` : '点按切换小城时间速度';
    button.setAttribute(
      'aria-label',
      `小城时间 ${speed} 倍速，${locked ? `${game}时按正常速度` : '点按切换'}`,
    );
  };
  const set = (next: ClockSpeed) => {
    speed = next;
    savePref(SPEED_KEY, String(next));
    render();
  };
  button.addEventListener('click', () => set(nextClockSpeed(speed)));
  place.onMinigame((on) => {
    if (on) set(NORMAL);
    else render();
  });
  render();
  return () => speed;
}
