import { CITY_TIME } from '../../content/city';
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

export function readClockSpeed(storage: Pick<Storage, 'getItem'>): ClockSpeed {
  try {
    const stored = storage.getItem(SPEED_KEY);
    return CITY_TIME.speeds.find((speed) => String(speed) === stored) ?? NORMAL;
  } catch {
    return NORMAL;
  }
}

/**
 * The speed button beside the city clock. Minigames run at 1× and lock it; leaving one
 * keeps 1× until the player taps again. Returns game minutes per real second.
 */
export function mountClockSpeed(place: PlaceState, button: HTMLButtonElement) {
  let speed = readClockSpeed(localStorage);
  const render = () => {
    const locked = place.get() !== 'city';
    button.disabled = locked;
    button.textContent = locked ? `钓鱼 ${speed}×` : `速度 ${speed}×`;
    button.title = locked ? '钓鱼时按正常速度' : '点按切换小城时间速度';
    button.setAttribute(
      'aria-label',
      `小城时间 ${speed} 倍速，${locked ? '钓鱼时按正常速度' : '点按切换'}`,
    );
  };
  const set = (next: ClockSpeed) => {
    speed = next;
    try {
      localStorage.setItem(SPEED_KEY, String(next));
    } catch {
      // Storage may be blocked; the speed still applies to this page.
    }
    render();
  };
  button.addEventListener('click', () => set(nextClockSpeed(speed)));
  place.subscribe((next) => {
    if (next === 'city') render();
    else set(NORMAL);
  });
  render();
  return () => speed;
}
