import { describe, expect, it } from 'vitest';
import { OrientationTracker } from '../../src/view/fishing/orientation';

function expectPoint(
  actual: { x: number; y: number } | null,
  x: number,
  y: number,
) {
  expect(actual).not.toBeNull();
  expect(actual!.x).toBeCloseTo(x, 8);
  expect(actual!.y).toBeCloseTo(y, 8);
}

describe('continuous orientation input', () => {
  it('preserves small gamma/beta changes without quantizing or clamping', () => {
    const tracker = new OrientationTracker();
    expectPoint(tracker.sample(10, 20, 0), 20, 10);
    expectPoint(tracker.sample(12.5, 17.25, 0), 17.25, 12.5);
    expectPoint(tracker.sample(-15, -25, 0), -25, -15);
  });

  it.each([
    [0, 20, 10],
    [90, -10, 20],
    [180, -20, -10],
    [270, 10, -20],
    [-90, 10, -20],
    [450, -10, 20],
  ])('maps screen angle %s using the existing screen axes', (angle, x, y) => {
    expectPoint(new OrientationTracker().sample(10, 20, angle), x, y);
  });

  it('crosses beta +180 smoothly and returns along the same path', () => {
    const tracker = new OrientationTracker();
    for (const [beta, continuous] of [
      [179, 179],
      [-179, 181],
      [-175, 185],
      [-179, 181],
      [179, 179],
      [175, 175],
    ])
      expectPoint(tracker.sample(beta!, 7, 0), 7, continuous!);
  });

  it('crosses beta -180 without reversing the movement direction', () => {
    const tracker = new OrientationTracker();
    expectPoint(tracker.sample(-179, -7, 0), -7, -179);
    expectPoint(tracker.sample(179, -7, 0), -7, -181);
    expectPoint(tracker.sample(175, -7, 0), -7, -185);
    expectPoint(tracker.sample(-179, -7, 0), -7, -179);
  });

  it('resolves the equivalent beta/gamma branch at gamma +90 in both directions', () => {
    const tracker = new OrientationTracker();
    const trace = [
      [10, 85, 85],
      [10, 89, 89],
      [170, -89, 91],
      [170, -85, 95],
      [170, -89, 91],
      [10, 89, 89],
      [10, 85, 85],
    ];
    for (const [beta, gamma, continuous] of trace)
      expectPoint(tracker.sample(beta!, gamma!, 0), continuous!, 10);
  });

  it('resolves the gamma -90 branch without jumping right', () => {
    const tracker = new OrientationTracker();
    expectPoint(tracker.sample(10, -85, 0), -85, 10);
    expectPoint(tracker.sample(10, -89, 0), -89, 10);
    expectPoint(tracker.sample(170, 89, 0), -91, 10);
    expectPoint(tracker.sample(170, 85, 0), -95, 10);
    expectPoint(tracker.sample(10, -89, 0), -89, 10);
  });

  it('retains continuous full turns instead of clamping or dropping large movement', () => {
    const tracker = new OrientationTracker();
    for (const [beta, gamma, continuous] of [
      [0, 0, 0],
      [0, 80, 80],
      [-180, -80, 100],
      [-180, 0, 180],
      [-180, 80, 260],
      [0, -80, 280],
      [0, 0, 360],
      [0, 80, 440],
      [0, 0, 360],
    ])
      expectPoint(tracker.sample(beta!, gamma!, 0), continuous!, 0);
  });

  it('accepts large valid pitch and roll changes', () => {
    const tracker = new OrientationTracker();
    tracker.sample(0, 0, 0);
    expectPoint(tracker.sample(100, 60, 0), 60, 100);
    expectPoint(tracker.sample(150, 60, 0), 60, 150);
  });

  it('reset establishes a fresh posture frame for calibration', () => {
    const tracker = new OrientationTracker();
    tracker.sample(10, 89, 0);
    expectPoint(tracker.sample(170, -89, 0), 91, 10);
    tracker.reset();
    expectPoint(tracker.sample(170, -89, 0), -89, 170);
    expectPoint(tracker.sample(168, -87, 0), -87, 168);
  });

  it('starts a new frame on screen rotation and tracks subsequent movement', () => {
    const tracker = new OrientationTracker();
    tracker.sample(10, 89, 0);
    tracker.sample(170, -89, 0);
    expectPoint(tracker.sample(170, -89, 90), -170, -89);
    expectPoint(tracker.sample(168, -87, 90), -168, -87);
  });

  it('does not reset continuous tracking for equivalent screen angles', () => {
    const tracker = new OrientationTracker();
    tracker.sample(10, 89, 0);
    expectPoint(tracker.sample(170, -89, 360), 91, 10);
  });

  it('rejects absent, nonfinite and out-of-range readings without changing the previous frame', () => {
    const tracker = new OrientationTracker();
    tracker.sample(10, 89, 0);
    for (const [beta, gamma, angle] of [
      [null, 0, 0],
      [0, null, 0],
      [NaN, 0, 0],
      [0, Infinity, 0],
      [0, 0, NaN],
      [181, 0, 0],
      [0, -91, 0],
      [null, 0, 90],
    ] as const)
      expect(tracker.sample(beta, gamma, angle)).toBeNull();
    expectPoint(tracker.sample(170, -89, 0), 91, 10);
  });
});
