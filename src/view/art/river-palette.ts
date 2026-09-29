import type { SpotId } from '../../content/fishing';
import { cityLight } from './city-light';
import { mix } from './city-palette';
import { WATER_VIEW } from './water-view';

/**
 * The river scene's colours and bands (池塘画面 in docs/ui-layout.md), shared by the
 * drawing (river.ts) and the page behind it, which continues them around the square art
 * (spec 031). Colours with a UI token mirror its value in styles/tokens.css.
 */
const V = WATER_VIEW;

/** Token values the Phaser art mirrors (styles/tokens.css). */
export const TOKEN = {
  paper: 0xfbf6ec,
  sage: 0xa8c3a0,
  sakura: 0xf2b8b5,
  wood: 0xe8d3b0,
  leaf: 0x7fa37a,
  brown: 0x8a6f5a,
  glint: 0xfff4c0,
  alert: 0xd9644c,
  'text-good': 0x4f7a4b,
  'btn-primary-bg': 0x557d51,
} as const;

export const DOCK = {
  colour: TOKEN.wood,
  plank: 0xc8ae88,
  edge: 0xb89a74,
};
export const ROD = TOKEN.brown;
/** The fishing line; red while a button fight's line is too tight or slack. */
export const LINE = { colour: TOKEN.paper, tight: TOKEN.alert };
export const FLOAT = { colour: 0xd98b6c, ripple: TOKEN.paper };
export const BITE = { colour: '#fff4c0', stroke: '#d09050' };
/**
 * The aiming preview (spec 033 F5, F5b): a warm-light ring and flight, turning deep green
 * where the cast would land on a fish shadow.
 */
export const AIM = { ring: TOKEN.glint, onShadow: TOKEN['text-good'] };
/**
 * Fish shadows under the water: bigger fish are darker (spec 033 F2); a button fight's
 * hooked fish darkens from `hooked[0]` to `hooked[1]` as it comes close (F1).
 */
export const SHADOW = {
  colour: 0x3f5f58,
  alpha: { small: 0.26, medium: 0.34, large: 0.44 },
  hooked: [0.42, 0.62],
} as const;
/** Ripples and the slow glints on the water, and the fireflies of the night. */
export const GLINT = 0xfffbef;
export const FIREFLY = 0xfff1a8;
export const LOTUS = { leaf: TOKEN.leaf, flower: TOKEN.sakura, alpha: 0.85 };
const REED = TOKEN.leaf;
/** Far-shore trees, alternating, and their reflections on the water. */
const TREES = [0x9db88f, 0xa8c3a0] as const;
export const REFLECTION_ALPHA = 0.35;

/** The far bank's strip, just above the horizon, per spot that has one. */
const BANK: Partial<Record<SpotId, number>> = {
  POND: 0xc9d8b5,
  REEDS: 0xbfd1a8,
  MOON: 0xb3c2b8,
};
export const BANK_STRIP = { top: V.horizonY - 26, bottom: V.horizonY + 4 };
/** The coast's sand in front of the dock. */
export const SAND = { colour: 0xefdcb6, top: V.nearY - 18 };
/** Water from the horizon (far) to the dock (near): calm mint, bluer on the lake and sea. */
const WATER: Record<SpotId, { far: number; near: number }> = {
  POND: { far: 0xb7dcd3, near: 0x8cc4bc },
  REEDS: { far: 0xb2d6c6, near: 0x86bcad },
  MOON: { far: 0xb1ccd6, near: 0x88acc0 },
  COAST: { far: 0xa9d8dc, near: 0x7fbfc8 },
};
/** The moon lake's own hue, mixed into everything but the dock, and its moon. */
const MOON_HUE = { colour: 0x8f8fc4, amount: 0.15 };
const MOON = {
  day: { colour: 0xfbf3dc, alpha: 0.6 },
  night: { colour: 0xfff1d0, alpha: 1 },
};

type Light = ReturnType<typeof cityLight>['daypart'];
/**
 * Light by the time of day (the style board's 光线随时间): a sky from top to bottom, a
 * tint mixed into the land and water by `amount`, and the sun where one shows.
 */
const LIGHTS: Record<
  Light,
  {
    sky: { top: number; bottom: number };
    tint: number;
    amount: number;
    sun: { x: number; y: number; radius: number; colour: number } | null;
  }
> = {
  morning: {
    sky: { top: 0xfff3dc, bottom: 0xe7f0e0 },
    tint: 0xfff3dc,
    amount: 0.12,
    sun: { x: 170, y: 86, radius: 22, colour: 0xfffaf0 },
  },
  day: {
    sky: { top: 0xdcece6, bottom: 0xf7f2e4 },
    tint: 0xffffff,
    amount: 0,
    sun: { x: 440, y: 52, radius: 20, colour: 0xfffdf6 },
  },
  evening: {
    sky: { top: 0xfbd9b8, bottom: 0xf8ebd6 },
    tint: 0xf6c9a0,
    amount: 0.2,
    sun: { x: 480, y: 92, radius: 26, colour: 0xffe9c7 },
  },
  night: {
    sky: { top: 0x5f6f93, bottom: 0x8e9cb5 },
    tint: 0x3e4a72,
    amount: 0.4,
    sun: null,
  },
};

/**
 * How a spot looks at a world `minute`: every colour of the scene but the dock, lit. The
 * time of day is the city's (cityLight), so both scenes change light together. Pure, so
 * the art and the page behind it agree.
 */
export function riverLook(spot: SpotId, minute: number) {
  const light = cityLight(minute).daypart;
  const { sky, tint, amount, sun } = LIGHTS[light];
  const hue = (colour: number) =>
    spot === 'MOON' ? mix(colour, MOON_HUE.colour, MOON_HUE.amount) : colour;
  const lit = (colour: number) => mix(hue(colour), tint, amount);
  const bank = BANK[spot];
  return {
    light,
    /** The sky's bottom colour also shows beside the water, below the far bank. */
    sky: { top: hue(sky.top), bottom: hue(sky.bottom) },
    bank: bank === undefined ? null : lit(bank),
    trees: TREES.map(lit),
    lotus: { leaf: lit(LOTUS.leaf), flower: lit(LOTUS.flower) },
    reed: lit(REED),
    water: { far: lit(WATER[spot].far), near: lit(WATER[spot].near) },
    sand: spot === 'COAST' ? lit(SAND.colour) : null,
    // The moon lake shows its moon instead.
    sun: spot === 'MOON' ? null : sun,
    moon: spot === 'MOON' ? MOON[light === 'night' ? 'night' : 'day'] : null,
    fireflies: light === 'night',
  };
}
export type RiverLook = ReturnType<typeof riverLook>;

/** Where the sky's gradient ends: at the far bank, or the sea's horizon. */
export const skyBottom = (look: RiverLook) =>
  look.bank === null ? V.horizonY : BANK_STRIP.top;

const css = (colour: number) => `#${colour.toString(16).padStart(6, '0')}`;

/**
 * The page behind the square river art (spec 031): the same sky, far bank, sand and
 * dock bands, placed with the art (`--river-top` and `--river-side` in layout.css), so
 * the scene reads as filling the screen.
 */
export function riverBackdrop(spot: SpotId, minute: number): string {
  const look = riverLook(spot, minute);
  const at = (y: number) =>
    `calc(var(--river-top) + var(--river-side) * ${y / V.size})`;
  // The sky's gradient, then bands down to the dock, which fills the rest.
  const stops = [
    `${css(look.sky.top)} 0%`,
    `${css(look.sky.top)} ${at(0)}`,
    `${css(look.sky.bottom)} ${at(skyBottom(look))}`,
  ];
  const band = (colour: number, top: number, bottom: number) =>
    stops.push(`${css(colour)} ${at(top)} ${at(bottom)}`);
  if (look.bank !== null) {
    band(look.bank, BANK_STRIP.top, BANK_STRIP.bottom);
    band(look.sky.bottom, BANK_STRIP.bottom, V.nearY);
  } else {
    band(look.sky.bottom, V.horizonY, SAND.top);
    if (look.sand !== null) band(look.sand, SAND.top, V.nearY);
  }
  stops.push(`${css(DOCK.colour)} ${at(V.nearY)}`);
  return `linear-gradient(to bottom, ${stops.join(', ')})`;
}
