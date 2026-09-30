import { CAT_DEFINITIONS } from '../../src/content/cats';
import type { CatShape } from '../../src/view/art/cat-look';

// Geometry and colour measures of the cat art, as the drawing tests read it.

export type Point = readonly [number, number];
/** A point of a Bézier curve through its control points (de Casteljau). */
const bezier = (points: readonly Point[], t: number): Point =>
  points.length === 1
    ? points[0]!
    : bezier(
        points
          .slice(1)
          .map((next, i): Point => [
            points[i]![0] + (next[0] - points[i]![0]) * t,
            points[i]![1] + (next[1] - points[i]![1]) * t,
          ]),
        t,
      );
/** Points along a shape: an ellipse's box corners, or a path with its curves sampled. */
export function outline(shape: CatShape): Point[] {
  if (shape.ellipse) {
    const [cx, cy, rx, ry] = shape.ellipse;
    return [
      [cx - rx, cy - ry],
      [cx + rx, cy + ry],
    ];
  }
  const points: Point[] = [];
  for (const part of shape.d!.match(/[MLQCZ][^MLQCZ]*/g)!) {
    const numbers = part
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean);
    const given: Point[] = [];
    for (let i = 0; i < numbers.length; i += 2)
      given.push([Number(numbers[i]), Number(numbers[i + 1])]);
    if (part[0] === 'Q' || part[0] === 'C') {
      const from = points.at(-1)!;
      for (let step = 1; step <= 10; step++)
        points.push(bezier([from, ...given], step / 10));
    } else points.push(...given);
  }
  return points;
}
export function box(shapes: readonly CatShape[]) {
  const points = shapes.flatMap(outline);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const [left, right] = [Math.min(...xs), Math.max(...xs)];
  const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

/** Relative luminance as WCAG 2 defines it. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
/** The WCAG contrast ratio of two colours, 1 to 21. */
export function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/**
 * T-13's four coats as the templates wear them since the look became five choices
 * (spec 041 T-14), and the two breeds T-13 drew.
 */
export const T13_COATS = {
  cream: CAT_DEFINITIONS.MOCHI.appearance,
  gray: CAT_DEFINITIONS.PEPPER.appearance,
  orange: CAT_DEFINITIONS.DOUBAO.appearance,
  tuxedo: CAT_DEFINITIONS.ZHIMA.appearance,
} as const;
export const T13_BREEDS = ['RAGDOLL', 'BRITISH_SHORTHAIR'] as const;
