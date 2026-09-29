import { LIGHT_TINT, mix } from './city-palette';

type Daypart = keyof typeof LIGHT_TINT;

/** How the city looks at an hour of the world clock. */
export interface CityLight {
  daypart: Daypart;
  /** Scenery colours move toward `tint` by `alpha`; 0 draws them as they are. */
  tint: number;
  alpha: number;
  windowsLit: boolean;
  fireflies: number;
}

const LOOK: Record<Daypart, Omit<CityLight, 'daypart' | 'tint'>> = {
  morning: { alpha: 0.2, windowsLit: false, fireflies: 0 },
  day: { alpha: 0, windowsLit: false, fireflies: 0 },
  evening: { alpha: 0.2, windowsLit: true, fireflies: 0 },
  night: { alpha: 0.21, windowsLit: true, fireflies: 6 },
};

/** Night from 20:00, morning from 5:00, day from 9:00, evening from 17:00. */
export function cityLight(minute: number): CityLight {
  const hour = Math.floor(minute / 60) % 24;
  const daypart: Daypart =
    hour >= 20 || hour < 5
      ? 'night'
      : hour < 9
        ? 'morning'
        : hour < 17
          ? 'day'
          : 'evening';
  return { daypart, tint: LIGHT_TINT[daypart], ...LOOK[daypart] };
}

/** A scenery colour under this light. */
export const shade = (colour: number, light: CityLight) =>
  mix(colour, light.tint, light.alpha);
