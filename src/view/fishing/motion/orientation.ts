interface OrientationFrame {
  beta: number;
  gamma: number;
  screenAngle: number;
}

function nearestTurn(angle: number, previous: number): number {
  return angle + 360 * Math.round((previous - angle) / 360);
}

/**
 * Continuous tilt coordinates, in degrees, before aiming sensitivity/clamping.
 * Z-X'-Y'' uses equivalent Euler branches (a,b,g) and
 * (a+180,180-b,g+180): https://www.w3.org/TR/orientation-event/#device-orientation
 * Select the closest branch/turn to the preceding sample, then rotate into
 * screen axes. A new input session or a gap that loses continuity must reset.
 */
export class OrientationTracker {
  private previous: OrientationFrame | null = null;

  reset(): void {
    this.previous = null;
  }

  sample(
    beta: number | null,
    gamma: number | null,
    screenAngle: number,
  ): { x: number; y: number } | null {
    if (
      beta === null ||
      gamma === null ||
      !Number.isFinite(beta) ||
      !Number.isFinite(gamma) ||
      !Number.isFinite(screenAngle) ||
      Math.abs(beta) > 180 ||
      Math.abs(gamma) > 90
    )
      return null;
    const angle = ((screenAngle % 360) + 360) % 360;
    const previous =
      this.previous?.screenAngle === angle ? this.previous : null;
    let frame: OrientationFrame = { beta, gamma, screenAngle: angle };
    if (previous) {
      const direct = {
        beta: nearestTurn(beta, previous.beta),
        gamma: nearestTurn(gamma, previous.gamma),
        screenAngle: angle,
      };
      const equivalent = {
        beta: nearestTurn(180 - beta, previous.beta),
        gamma: nearestTurn(gamma + 180, previous.gamma),
        screenAngle: angle,
      };
      const distance = (candidate: OrientationFrame) =>
        (candidate.beta - previous.beta) ** 2 +
        (candidate.gamma - previous.gamma) ** 2;
      frame = distance(equivalent) < distance(direct) ? equivalent : direct;
    }
    this.previous = frame;
    const radians = (angle * Math.PI) / 180;
    return {
      x: frame.gamma * Math.cos(radians) - frame.beta * Math.sin(radians),
      y: frame.beta * Math.cos(radians) + frame.gamma * Math.sin(radians),
    };
  }
}
