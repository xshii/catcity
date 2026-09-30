import { describe, expect, it } from 'vitest';
import { PET_SPOTS } from '../../src/content/petting';
import {
  PETTING_ART,
  PET_SPOT_REGIONS,
  pettingRegions,
  spotAt,
} from '../../src/view/art/cat-petting';

/**
 * The cat spans the screen less its 16px gutters (petting.css); on the narrowest phone
 * of ui-design 3.3 (360 wide) that is 328px for the drawing's width.
 */
const NARROWEST_PX_PER_UNIT = (360 - 2 * 16) / PETTING_ART.width;
/** ui-design 2.4: nothing smaller than 44×44 is for a finger. */
const FINGER_PX = 44;

describe('where the cat can be stroked (ui-design 5.5)', () => {
  it('each spot is a region of the drawing a finger can hit on the narrowest phone', () => {
    for (const spot of PET_SPOTS) {
      const [cx, cy, rx, ry] = PET_SPOT_REGIONS[spot];
      expect(spotAt({ x: cx, y: cy }), spot).toBe(spot);
      expect(
        2 * Math.min(rx, ry) * NARROWEST_PX_PER_UNIT,
        spot,
      ).toBeGreaterThanOrEqual(FINGER_PX);
      expect(cx - rx, spot).toBeGreaterThanOrEqual(0);
      expect(cx + rx, spot).toBeLessThanOrEqual(PETTING_ART.width);
      expect(cy - ry, spot).toBeGreaterThanOrEqual(0);
      expect(cy + ry, spot).toBeLessThanOrEqual(PETTING_ART.height);
    }
  });

  it('the regions never overlap, so a touch is on one spot at most', () => {
    const inside = (
      [cx, cy, rx, ry]: readonly number[],
      x: number,
      y: number,
    ) => ((x - cx!) / rx!) ** 2 + ((y - cy!) / ry!) ** 2 <= 1;
    for (let x = 0; x <= PETTING_ART.width; x++)
      for (let y = 0; y <= PETTING_ART.height; y++) {
        const hits = PET_SPOTS.filter((spot) =>
          inside(PET_SPOT_REGIONS[spot], x, y),
        );
        expect(hits.length, `${x},${y}`).toBeLessThanOrEqual(1);
        expect(spotAt({ x, y }), `${x},${y}`).toBe(hits[0] ?? null);
      }
  });

  it('the eyes, the air above the cat and a point off the drawing are no spot', () => {
    // The eyes sit at y 38 of the 72×64 head, drawn at 1.12 from y 24.
    expect(spotAt({ x: 40, y: 24 + 38 * 1.12 })).toBeNull();
    expect(spotAt({ x: 100, y: 5 })).toBeNull();
    expect(spotAt({ x: Number.NaN, y: Number.NaN })).toBeNull();
  });

  it('are drawn in the drawing’s own space, one shape per spot to glow', () => {
    const markup = pettingRegions();
    expect(markup).toContain(
      `viewBox="0 0 ${PETTING_ART.width} ${PETTING_ART.height}"`,
    );
    for (const spot of PET_SPOTS) {
      const [cx, cy, rx, ry] = PET_SPOT_REGIONS[spot];
      expect(markup).toContain(
        `<ellipse data-region="${spot}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`,
      );
    }
  });
});
