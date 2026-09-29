import type { SpotId } from '../../content/fishing';
import { WATER_VIEW } from './water-view';

/**
 * The river scene's fixed colours and bands, shared by the drawing (river.ts) and the page
 * behind it, which continues them around the square art (spec 031).
 */
const V = WATER_VIEW;
export const SKY = 0xeaf0de;
export const DOCK = 0xbfa47c;
/** The far bank's strip, just above the horizon, per spot that has one. */
export const BANK: Partial<Record<SpotId, number>> = {
  POND: 0xc9d8b5,
  REEDS: 0xbfd1a8,
  MOON: 0xa9b3c4,
};
export const BANK_STRIP = { top: V.horizonY - 26, bottom: V.horizonY + 4 };
/** The moon lake's evening tint over everything but the dock. */
export const MOON_TINT = { colour: 0x7778b0, alpha: 0.18 };
/** The coast's sand in front of the dock. */
export const SAND = { colour: 0xe9d5ac, top: V.nearY - 18 };

const css = (colour: number) => `#${colour.toString(16).padStart(6, '0')}`;
const tinted = (colour: number) => {
  const channel = (shift: number) => {
    const base = (colour >> shift) & 0xff;
    const tint = (MOON_TINT.colour >> shift) & 0xff;
    return Math.round(base + (tint - base) * MOON_TINT.alpha) << shift;
  };
  return channel(16) | channel(8) | channel(0);
};

/**
 * The page behind the square river art (spec 031): the same sky, far bank, sand and
 * dock bands, placed with the art (`--river-top` and `--river-side` in layout.css), so
 * the scene reads as filling the screen.
 */
export function riverBackdrop(spot: SpotId): string {
  const shade = (colour: number) =>
    css(spot === 'MOON' ? tinted(colour) : colour);
  const at = (y: number) =>
    `calc(var(--river-top) + var(--river-side) * ${y / V.size})`;
  // Bands from the top, each down to its bottom edge; the dock fills the rest.
  const bands: [colour: string, bottom: number][] = [];
  const bank = BANK[spot];
  if (bank !== undefined)
    bands.push([shade(SKY), BANK_STRIP.top], [shade(bank), BANK_STRIP.bottom]);
  if (spot === 'COAST')
    bands.push([shade(SKY), SAND.top], [css(SAND.colour), V.nearY]);
  else bands.push([shade(SKY), V.nearY]);
  let from = '0%';
  const stops = bands.map(([colour, bottom]) => {
    const stop = `${colour} ${from} ${at(bottom)}`;
    from = at(bottom);
    return stop;
  });
  return `linear-gradient(to bottom, ${[...stops, `${css(DOCK)} ${from}`].join(', ')})`;
}
