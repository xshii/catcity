import { describe, expect, it } from 'vitest';
import { FISHING, SPOT_IDS } from '../../src/content/fishing';
import { fishShadows } from '../../src/core';
import { shadowAt } from '../../src/core/fishing/shadows';
import {
  aimAtPoint,
  castPreview,
  companionBox,
  flightPoint,
  hookedFish,
  landingShare,
  motionAim,
  planeBox,
  planePoint,
  shadowPoint,
  showsShadows,
  WATER_VIEW,
  waterPoint,
} from '../../src/view/art/water-view';
import { createRodTip } from '../../src/view/motion/tip';

const V = WATER_VIEW;

describe('motion aiming: the pitch alone sets how far the cast lands', () => {
  const G = FISHING.motion.gesture;
  const S = FISHING.shadows;
  /** A comfortable hold, the top of the phone raised 40°. */
  const REST = 40;
  /** The power the rod settles on, pitched this far back (+) or forward (−) from rest. */
  const pitched = (degrees: number) => {
    const tip = createRodTip();
    tip.calibrate({ x: 0, y: REST });
    let power = 0;
    for (let reading = 0; reading < 60; reading++)
      power = tip.power({ x: 0, y: REST + degrees });
    return power;
  };
  const share = (degrees: number) => {
    const { aimDepth, power } = motionAim(pitched(degrees));
    return landingShare(aimDepth, power);
  };

  it('moves the landing from the nearest water to the farthest across the pitch range', () => {
    expect(share(-G.powerRangeDeg)).toBe(V.reach.near);
    expect(share(G.powerRangeDeg)).toBe(V.reach.far);
    expect(share(0)).toBeCloseTo((V.reach.near + V.reach.far) / 2);
    // Evenly: every degree moves it as far, and farther back is farther out.
    const shares = Array.from({ length: 11 }, (_, i) =>
      share(-G.powerRangeDeg + (i * G.powerRangeDeg) / 5),
    );
    const stride = (V.reach.far - V.reach.near) / 10;
    shares
      .slice(1)
      .forEach((next, i) => expect(next - shares[i]!).toBeCloseTo(stride, 2));
  });

  it('reaches both ends without bending the wrist far or tipping the phone flat', () => {
    expect(G.powerRangeDeg).toBeLessThanOrEqual(30);
    expect(REST - G.powerRangeDeg).toBeGreaterThanOrEqual(10);
  });

  it('can land on a fish shadow anywhere shadows swim, ring on the shadow', () => {
    for (let reach = S.reach.min; reach <= S.reach.max; reach += 10) {
      const shadow = {
        id: 'shadow',
        direction: 0,
        reach,
        size: 'small',
        speciesId: 'SILVER',
      } as const;
      const degrees = ((reach - 50) / 50) * G.powerRangeDeg;
      const cast = { direction: 0, ...motionAim(pitched(degrees)) };
      expect(shadowAt([shadow], cast)).toBe(shadow);
      const ring = waterPoint(0, landingShare(cast.aimDepth, cast.power));
      const drawn = shadowPoint(0, reach);
      expect(ring.y).toBeCloseTo(drawn.y, 0);
    }
  });

  it('says when the ring is at the near or far limit, where more pitch does nothing', () => {
    const limit = (power: number) =>
      castPreview(
        { seed: 3, minute: 0 },
        'POND',
        { direction: 0, ...motionAim(power) },
        { x: 372, y: 330 },
      ).limit;
    expect(limit(0)).toBe('near');
    expect(limit(100)).toBe('far');
    for (const power of [1, 50, 99]) expect(limit(power)).toBeNull();
    expect(limit(pitched(-90))).toBe('near');
    expect(limit(pitched(90))).toBe('far');
  });
});

it('lands farther with more power or depth, always on the water', () => {
  expect(landingShare(50, 80)).toBeGreaterThan(landingShare(50, 30));
  expect(landingShare(80, 50)).toBeGreaterThan(landingShare(30, 50));
  expect(landingShare(0, 0)).toBe(V.reach.near);
  expect(landingShare(100, 100)).toBe(V.reach.far);
  for (const direction of [-45, 0, 45])
    for (const share of [V.reach.near, V.reach.far]) {
      const { y } = waterPoint(direction, share);
      expect(y).toBeGreaterThan(V.horizonY);
      expect(y).toBeLessThan(V.nearY);
    }
});

it('shrinks toward the horizon and mirrors left and right', () => {
  expect(waterPoint(0, 0.8).scale).toBeLessThan(waterPoint(0, 0.2).scale);
  const left = waterPoint(-30, 0.5);
  const right = waterPoint(30, 0.5);
  expect(left.x + right.x).toBeCloseTo(2 * V.centerX);
});

it('places the open-water plane over the canvas as drawn, wherever it sits in its box', () => {
  // A tall phone: the square canvas fills its box, wider than the screen.
  const filled = planeBox(
    { left: -78, top: 132 },
    { left: -78, top: 132, width: 546, height: 546 },
  );
  expect(filled.left).toBeCloseTo(546 * V.plane.left);
  expect(filled.top).toBeCloseTo(546 * V.plane.top);
  expect(filled.side).toBeCloseTo(546 * V.plane.side);
  // The canvas still at another size, centred in the box: the plane follows the canvas.
  const centred = planeBox(
    { left: -78, top: 132 },
    { left: 0, top: 210, width: 390, height: 390 },
  );
  expect(centred.left).toBeCloseTo(78 + 390 * V.plane.left);
  expect(centred.top).toBeCloseTo(78 + 390 * V.plane.top);
  expect(centred.side).toBeCloseTo(390 * V.plane.side);
});

describe('the cat beside the player on the page (R-03)', () => {
  const { x, y, scale, outline } = V.companion;
  /** The cat as drawn on a canvas `side` pixels wide, in the box's pixels. */
  const drawn = (side: number, offset = { left: 0, top: 0 }) => {
    const unit = side / V.size;
    return {
      left: offset.left + (x + outline.left * scale) * unit,
      right: offset.left + (x + outline.right * scale) * unit,
      top: offset.top + (y + outline.top * scale) * unit,
      bottom: offset.top + (y + outline.bottom * scale) * unit,
      feet: { x: offset.left + x * unit, y: offset.top + y * unit },
    };
  };
  const phones = [
    // 390×844: the canvas fills its box, wider than the screen.
    { box: { left: -78, top: 132 }, side: 546, screenRight: 390 },
    // 360×640 and 375×553: shorter screens draw the river smaller.
    { box: { left: -27, top: 60 }, side: 414, screenRight: 360 },
    { box: { left: 24, top: 60 }, side: 327, screenRight: 375 },
  ];

  it('takes a tap anywhere on the cat as drawn, at least a finger wide and tall', () => {
    for (const { box, side, screenRight } of phones) {
      const { touch } = companionBox(
        box,
        { ...box, width: side, height: side },
        screenRight,
      );
      const cat = drawn(side);
      expect(touch.width).toBeGreaterThanOrEqual(V.companionTouch);
      expect(touch.height).toBeGreaterThanOrEqual(V.companionTouch);
      expect(touch.left).toBeLessThanOrEqual(cat.left);
      expect(touch.left + touch.width).toBeGreaterThanOrEqual(cat.right);
      expect(touch.top + touch.height).toBeGreaterThanOrEqual(cat.bottom);
      // Grown down and sideways, never up past the ears into the water's hint above.
      expect(touch.top).toBeCloseTo(cat.top);
      expect(touch.left + touch.width / 2).toBeCloseTo(
        (cat.left + cat.right) / 2,
      );
    }
  });

  it('stands its bubble beside the cat at head height, as wide as the screen leaves', () => {
    for (const { box, side, screenRight } of phones) {
      const { touch, bubble } = companionBox(
        box,
        { ...box, width: side, height: side },
        screenRight,
      );
      expect(bubble.left).toBeGreaterThan(touch.left + touch.width);
      expect(bubble.top).toBeCloseTo(touch.top);
      // Its right edge keeps the screen's margin, in page pixels.
      expect(box.left + bubble.left + bubble.room).toBeCloseTo(
        screenRight - V.companionBubble.margin,
      );
      expect(bubble.room).toBeGreaterThan(120);
    }
  });

  it('follows the canvas as drawn, wherever it sits in its box', () => {
    const box = { left: -78, top: 132 };
    const { touch } = companionBox(
      box,
      { left: 0, top: 210, width: 390, height: 390 },
      390,
    );
    const cat = drawn(390, { left: 78, top: 78 });
    expect(touch.left).toBeLessThanOrEqual(cat.feet.x);
    expect(touch.left + touch.width).toBeGreaterThanOrEqual(cat.feet.x);
    expect(touch.top).toBeCloseTo(cat.top);
    expect(touch.top + touch.height).toBeGreaterThanOrEqual(cat.feet.y);
  });
});

it('turns a tap on the water into the aim whose preview lands there', () => {
  const { maxDirection } = FISHING.input;
  for (const power of [30, 50, 80])
    for (const direction of [-maxDirection, -20, 0, 25, maxDirection])
      for (const depth of [10, 40, 70]) {
        const { x, y } = waterPoint(direction, landingShare(depth, power));
        const aim = aimAtPoint(x, y, power)!;
        expect(aim.direction).toBe(direction);
        // The depth slider moves in steps of 5.
        expect(Math.abs(aim.depth - depth)).toBeLessThanOrEqual(5);
        const shown = waterPoint(aim.direction, landingShare(aim.depth, power));
        expect(Math.abs(shown.y - y)).toBeLessThan(12);
      }
  expect(aimAtPoint(V.centerX, V.horizonY - 10, 50)).toBeNull();
  expect(aimAtPoint(V.centerX, V.nearY + 10, 50)).toBeNull();
});

it('puts the square fight plane over open water', () => {
  const { left, top, side } = V.plane;
  const corners = [
    [left, top],
    [left + side, top],
    [left, top + side],
    [left + side, top + side],
  ].map(([x, y]) => [x! * V.size, y! * V.size] as const);
  for (const [x, y] of corners) {
    expect(y).toBeGreaterThanOrEqual(V.horizonY);
    expect(y).toBeLessThanOrEqual(V.nearY);
    const share = (V.nearY - y) / (V.nearY - V.horizonY);
    const half = V.nearHalf + (V.horizonHalf - V.nearHalf) * share;
    expect(Math.abs(x - V.centerX)).toBeLessThanOrEqual(half);
  }
});

it('draws each fish shadow where a cast that meets it head-on lands', () => {
  for (let hour = 0; hour < 20; hour++)
    for (const spotId of SPOT_IDS)
      for (const shadow of fishShadows({ seed: 9, minute: hour * 60 }, spotId))
        for (const power of [30, 60, 90]) {
          const aimDepth = 2 * shadow.reach - power;
          if (aimDepth < 0 || aimDepth > FISHING.input.maxDepth) continue;
          const cast = { direction: shadow.direction, aimDepth, power };
          expect(shadowAt([shadow], cast)).toBe(shadow);
          const drawn = shadowPoint(shadow.direction, shadow.reach);
          const landing = waterPoint(
            shadow.direction,
            landingShare(aimDepth, power),
          );
          expect(drawn.x).toBeCloseTo(landing.x);
          expect(drawn.y).toBeCloseTo(landing.y);
          expect(drawn.y).toBeGreaterThan(V.horizonY);
          expect(drawn.y).toBeLessThan(V.nearY);
        }
});

it('keeps the fish shadows in the water until a fish is hooked', () => {
  expect(showsShadows(null)).toBe(true);
  for (const phase of ['charge', 'waiting', 'hook'] as const)
    expect(showsShadows({ phase })).toBe(true);
  // The fight shows the hooked fish instead.
  expect(showsShadows({ phase: 'fight' })).toBe(false);
});

describe('the hooked fish of a button fight (spec 033 F1)', () => {
  const tick = 7;
  it('sways below the float and, as the fight fills, grows and comes toward the dock', () => {
    for (const share of [V.reach.near, 0.5, V.reach.far]) {
      const landing = waterPoint(20, share);
      const start = hookedFish(landing, 0, tick);
      expect(start).toMatchObject({ scale: landing.scale, near: 0 });
      expect(start.y).toBeCloseTo(landing.y + V.hooked.below * landing.scale);
      let last = start;
      for (let progress = 10; progress <= 100; progress += 10) {
        const fish = hookedFish(landing, progress, tick);
        expect(fish.x).toBe(start.x);
        expect(fish.y).toBeGreaterThanOrEqual(last.y);
        expect(fish.scale).toBeGreaterThan(last.scale);
        expect(fish.near).toBeCloseTo(progress / 100);
        last = fish;
      }
      // At the end it has come part of the way, and stays on the water.
      expect(last.scale).toBeCloseTo(2 * landing.scale);
      expect(last.y).toBeLessThan(V.nearY);
      if (start.y < V.nearY)
        expect(last.y).toBeCloseTo(
          start.y + (V.nearY - start.y) * V.hooked.approach,
        );
    }
  });

  it('keeps out-of-range progress within the fight', () => {
    const landing = waterPoint(0, 0.5);
    expect(hookedFish(landing, -20, tick)).toEqual(
      hookedFish(landing, 0, tick),
    );
    expect(hookedFish(landing, 140, tick)).toEqual(
      hookedFish(landing, 100, tick),
    );
  });

  it('sways side to side with the fight tick only', () => {
    const landing = waterPoint(0, 0.5);
    const xs = [0, 8, 16, 24].map((t) => hookedFish(landing, 50, t).x);
    expect(new Set(xs).size).toBe(xs.length);
    for (const x of xs)
      expect(
        Math.abs(x - (landing.x - V.hooked.behind * landing.scale)),
      ).toBeLessThanOrEqual(V.hooked.sway);
  });
});

it('puts a fight-plane point on the canvas where the overlay ring is drawn', () => {
  const { left, top, side } = V.plane;
  expect(planePoint({ x: 0, y: 0 })).toMatchObject({
    x: left * V.size,
    y: top * V.size,
  });
  expect(planePoint({ x: 100, y: 100 })).toMatchObject({
    x: (left + side) * V.size,
    y: (top + side) * V.size,
  });
  // Same perspective as a landing at that height: smaller toward the horizon.
  const centre = planePoint(FISHING.motion.planeCentre);
  const share = (V.nearY - centre.y) / (V.nearY - V.horizonY);
  expect(centre.scale).toBeCloseTo(waterPoint(0, share).scale);
  expect(planePoint({ x: 50, y: 10 }).scale).toBeLessThan(centre.scale);
});

describe('the landing preview while aiming (spec 033 F5, F5b)', () => {
  /** A rod tip over the water, as the river art has it. */
  const TIP = { x: 372, y: 330 };
  const WORLD = { seed: 3, minute: 0 };
  const preview = (direction: number, aimDepth: number, power: number) =>
    castPreview(WORLD, 'MOON', { direction, aimDepth, power }, TIP);
  const on = (point: { x: number; y: number }) => ({
    x: expect.closeTo(point.x, 6),
    y: expect.closeTo(point.y, 6),
  });

  it('rings the point the cast lands on, farther with power and mirrored by aim', () => {
    for (const [direction, depth, power] of [
      [-45, 0, 0],
      [-20, 50, 50],
      [0, 30, 70],
      [35, 100, 100],
    ] as const)
      expect(preview(direction, depth, power).landing).toEqual(
        waterPoint(direction, landingShare(depth, power)),
      );
    expect(preview(0, 50, 80).landing.y).toBeLessThan(
      preview(0, 50, 30).landing.y,
    );
    const left = preview(-30, 50, 60).landing;
    const right = preview(30, 50, 60).landing;
    expect(left.x + right.x).toBeCloseTo(2 * V.centerX);
    expect(left.y).toBeCloseTo(right.y);
  });

  it('turns the ring green on a fish shadow exactly where Core finds the cast on one', () => {
    const shadows = fishShadows(WORLD, 'MOON');
    let checked = 0;
    for (const shadow of shadows)
      for (const power of [40, 70]) {
        const aimDepth = 2 * shadow.reach - power;
        if (aimDepth < 0 || aimDepth > FISHING.input.maxDepth) continue;
        // Head-on: the ring sits on the drawn shadow, and Core meets that shadow.
        const aimed = preview(shadow.direction, aimDepth, power);
        expect(aimed.landing).toMatchObject(
          on(shadowPoint(shadow.direction, shadow.reach)),
        );
        expect(aimed.shadow).toEqual(shadow);
        checked++;
      }
    expect(checked).toBeGreaterThan(0);
    // Everywhere else the preview answers as the cast would: green on one, cream off.
    const seen = new Set<boolean>();
    const { maxDirection, maxDepth, maxPower } = FISHING.input;
    for (
      let direction = -maxDirection;
      direction <= maxDirection;
      direction += 5
    )
      for (let aimDepth = 0; aimDepth <= maxDepth; aimDepth += 10)
        for (let power = 0; power <= maxPower; power += 10) {
          const cast = { direction, aimDepth, power };
          const { shadow } = preview(direction, aimDepth, power);
          expect(shadow).toEqual(shadowAt(shadows, cast));
          seen.add(shadow !== null);
        }
    expect(seen).toEqual(new Set([true, false]));
  });

  it('flies the float from the rod tip in an arc onto the landing', () => {
    const landing = { x: 200, y: 400 };
    expect(flightPoint(TIP, landing, 0)).toEqual(TIP);
    expect(flightPoint(TIP, landing, 1)).toEqual(on(landing));
    // Midway it rises above the straight line by the lift.
    expect(flightPoint(TIP, landing, 0.5)).toEqual(
      on({ x: 286, y: 365 - V.flight.lift }),
    );
  });

  it('previews exactly the flight the float will take, dashed, from the tip onto the ring', () => {
    for (const direction of [-45, 0, 45])
      for (const power of [0, 50, 100]) {
        const { arc, landing } = preview(direction, 50, power);
        expect(arc[0]).toEqual(TIP);
        expect(arc.at(-1)).toEqual(on(landing));
        // Dash, gap, …, dash: an even number of points, so the last dash ends on the ring.
        expect(arc).toHaveLength(2 * V.flight.dashes);
        arc.forEach((point, i) =>
          expect(point).toEqual(
            flightPoint(TIP, landing, i / (arc.length - 1)),
          ),
        );
        for (const point of arc) {
          expect(point.y).toBeGreaterThan(V.horizonY);
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(V.size);
        }
      }
    // It follows the aim sideways and reaches farther with power.
    expect(preview(-30, 50, 60).arc[12]!.x).toBeLessThan(
      preview(30, 50, 60).arc[12]!.x,
    );
    expect(preview(0, 50, 90).arc.at(-1)!.y).toBeLessThan(
      preview(0, 50, 20).arc.at(-1)!.y,
    );
  });
});
