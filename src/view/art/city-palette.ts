/**
 * The city map's colours (docs/ui-layout.md「小城画面」). `TOKENS` mirrors the values of
 * the CSS tokens of the same name in styles/tokens.css (a unit test keeps them equal);
 * the map's own shades are mixed from them.
 */
export const TOKENS = {
  paper: 0xfbf6ec,
  apricot: 0xf6c9a0,
  sage: 0xa8c3a0,
  mint: 0x9ccfc8,
  sakura: 0xf2b8b5,
  wood: 0xe8d3b0,
  leaf: 0x7fa37a,
  brown: 0x8a6f5a,
  ink: 0x5e4b3e,
  accentStrong: 0xe0a068,
  btnPrimaryBg: 0x557d51,
  sceneGround: 0xf1ead9,
} as const;

/** `from` moved toward `to` by `amount` (0–1), channel by channel. */
export function mix(from: number, to: number, amount: number): number {
  const channel = (shift: number) => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * amount) << shift;
  };
  return channel(16) | channel(8) | channel(0);
}

const css = (colour: number) => `#${colour.toString(16).padStart(6, '0')}`;
const T = TOKENS;

/** Scenery is shaded by the light of the hour (city-light.ts); highlights are not. */
export const CITY_COLOURS = {
  board: T.paper,
  /** Around the board, as the page's `--scene-ground`. */
  ground: T.sceneGround,
  /** Warm-brown outlines of tiles and buildings, and building shadows. */
  line: T.brown,
  grass: mix(T.sage, T.paper, 0.4),
  /** Grass not yet bought. */
  wild: mix(T.sage, T.paper, 0.7),
  tuft: mix(T.sage, T.leaf, 0.6),
  dirt: T.wood,
  dirtLine: mix(T.wood, T.brown, 0.3),
  stone: mix(T.paper, T.ink, 0.2),
  stoneLine: mix(T.paper, T.ink, 0.38),
  water: {
    POND: mix(T.mint, T.paper, 0.3),
    RIVER: T.mint,
    /** The moon lake keeps a lilac cast. */
    LAKE: 0xb2bddb,
    SEA: mix(T.mint, 0x5f98b0, 0.4),
  },
  glint: 0xfffbef,
  cafe: T.apricot,
  cafeRoof: mix(T.apricot, T.brown, 0.25),
  door: mix(T.wood, T.brown, 0.5),
  apartment: T.sakura,
  apartmentRoof: mix(T.sakura, T.brown, 0.2),
  lodge: mix(T.paper, T.wood, 0.4),
  lodgeRoof: mix(T.sage, T.brown, 0.15),
  window: 0xfff4da,
  /** Windows in the evening and at night, with a warm glow around them. */
  lit: 0xffe39a,
  glow: T.apricot,
  firefly: 0xfff1a8,
  /** Shores of the chosen water; the chosen tile and the walking cat. */
  shore: T.accentStrong,
  selected: T.btnPrimaryBg,
  /** Under a lifted cat: a tile it cannot be sent to. */
  blocked: mix(T.paper, T.ink, 0.65),
  /** Walk routes use a deeper shade of each cat's fur colour. */
  route: {
    cream: 0xc38d55,
    gray: 0x68758d,
    orange: 0xd9773a,
    black: 0x4f4540,
    white: 0x9c9285,
    brown: 0x6f4b35,
  },
  routeDot: T.paper,
} as const;

/** The light of the hour shades the map toward these (style board「光线随时间」). */
export const LIGHT_TINT = {
  morning: 0xfff3dc,
  day: T.paper,
  evening: 0xfbc99e,
  /** A soft slate dusk: lighter and less blue than the board's night sky, so grass stays green. */
  night: 0x656588,
} as const;

/** Map labels: ink on a paper halo, readable at any hour. */
export const LABEL = {
  color: css(T.ink),
  halo: css(T.paper),
  font: "ui-rounded, 'SF Pro Rounded', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
} as const;
