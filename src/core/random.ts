/** Stable uint32 LCG. Gameplay only; not cryptographic or generative randomness. */
export class RandomService {
  constructor(public state: number) {
    if (!Number.isInteger(state) || state < 0 || state > 0xffffffff)
      throw new Error('Seed must be a uint32');
  }

  nextInt(exclusiveMax: number): number {
    if (!Number.isInteger(exclusiveMax) || exclusiveMax < 1)
      throw new Error('Invalid random range');
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return Math.floor((this.state / 0x100000000) * exclusiveMax);
  }
}
