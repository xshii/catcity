import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SPOT_IDS } from '../../src/content/fishing';
import { cityLight } from '../../src/view/art/city-light';
import {
  BANK_STRIP,
  DOCK,
  riverBackdrop,
  riverLook,
  SAND,
  TOKEN,
} from '../../src/view/art/river-palette';
import { WATER_VIEW } from '../../src/view/art/water-view';

/** A world minute at `hour` on the first day. */
const hour = (h: number) => h * 60;
const at = (y: number) =>
  `calc(var(--river-top) + var(--river-side) * ${y / WATER_VIEW.size})`;
const css = (colour: number) => `#${colour.toString(16).padStart(6, '0')}`;
const channels = (colour: number) => [
  (colour >> 16) & 0xff,
  (colour >> 8) & 0xff,
  colour & 0xff,
];
const brightness = (colour: number) =>
  channels(colour).reduce((sum, channel) => sum + channel, 0);
const warmth = (colour: number) => {
  const [red, , blue] = channels(colour);
  return red! - blue!;
};

it('mirrors the UI tokens the art shares', () => {
  const tokens = readFileSync('src/view/styles/tokens.css', 'utf8');
  for (const [name, colour] of Object.entries(TOKEN))
    expect(tokens).toContain(`--${name}: ${css(colour)};`);
});

describe('light by the game hour', () => {
  it('changes with the city: the same time of day at every hour', () => {
    for (const spot of SPOT_IDS)
      for (let h = 0; h < 48; h++)
        expect(riverLook(spot, hour(h) + 30).light).toBe(
          cityLight(hour(h) + 30).daypart,
        );
  });

  it('warms every spot in the evening and darkens it at night, with fireflies only then', () => {
    for (const spot of SPOT_IDS) {
      const day = riverLook(spot, hour(12));
      const evening = riverLook(spot, hour(18));
      const night = riverLook(spot, hour(22));
      expect(warmth(evening.water.near)).toBeGreaterThan(
        warmth(day.water.near),
      );
      expect(warmth(evening.sky.top)).toBeGreaterThan(warmth(day.sky.top));
      const darker = (atNight: number, byDay: number) =>
        expect(brightness(atNight)).toBeLessThan(brightness(byDay));
      darker(night.water.near, day.water.near);
      darker(night.water.far, day.water.far);
      darker(night.sky.top, day.sky.top);
      darker(night.trees[0]!, day.trees[0]!);
      expect([day, evening, night].map((look) => look.fireflies)).toEqual([
        false,
        false,
        true,
      ]);
      // Calm water is paler toward the horizon.
      expect(brightness(day.water.far)).toBeGreaterThan(
        brightness(day.water.near),
      );
    }
  });

  it('shows the moon lake its own moon, bright at night, and a sun elsewhere by day', () => {
    expect(riverLook('MOON', hour(12))).toMatchObject({ sun: null });
    expect(riverLook('MOON', hour(22)).moon!.alpha).toBeGreaterThan(
      riverLook('MOON', hour(12)).moon!.alpha,
    );
    for (const spot of ['POND', 'REEDS', 'COAST'] as const) {
      expect(riverLook(spot, hour(12))).toMatchObject({ moon: null });
      expect(riverLook(spot, hour(12)).sun).not.toBeNull();
      expect(riverLook(spot, hour(22)).sun).toBeNull();
    }
  });
});

describe('the page behind the square art', () => {
  it('continues the art: the sky from the top, the far bank at its strip, then the dock', () => {
    const look = riverLook('POND', hour(12));
    const pond = riverBackdrop('POND', hour(12));
    expect(pond).toMatch(
      new RegExp(`^linear-gradient\\(to bottom, ${css(look.sky.top)} 0%`),
    );
    expect(pond).toContain(
      `${css(look.sky.bottom)} ${at(BANK_STRIP.top)}, ${css(look.bank!)} ${at(BANK_STRIP.top)} ${at(BANK_STRIP.bottom)}`,
    );
    expect(pond).toContain(`${css(DOCK.colour)} ${at(WATER_VIEW.nearY)})`);
    // The coast has no far bank but sand in front of the dock.
    const coast = riverBackdrop('COAST', hour(12));
    expect(coast).not.toContain(css(look.bank!));
    expect(coast).toContain(
      `${css(riverLook('COAST', hour(12)).sand!)} ${at(SAND.top)} ${at(WATER_VIEW.nearY)}`,
    );
  });

  it('follows the hour and the moon lake’s hue, but never tints the dock', () => {
    for (const spot of SPOT_IDS) {
      const backdrops = [6, 12, 18, 22].map((h) =>
        riverBackdrop(spot, hour(h)),
      );
      expect(new Set(backdrops).size).toBe(backdrops.length);
      for (const backdrop of backdrops)
        expect(backdrop).toContain(
          `${css(DOCK.colour)} ${at(WATER_VIEW.nearY)})`,
        );
    }
    const pond = riverLook('POND', hour(12));
    const moon = riverBackdrop('MOON', hour(12));
    expect(moon).not.toContain(css(pond.sky.top));
    expect(moon).not.toContain(css(pond.sky.bottom));
  });
});
