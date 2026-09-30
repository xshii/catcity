/** Salts that split one world seed into independent deterministic streams. */
const STREAM_SALT = {
  map: 0xa17c9e33,
  trash: 0x85ebca6b,
  bite: 0x27d4eb2f,
  fish: 0x165667b1,
  shadow: 0xd3a2646c,
  petting: 0x9e3779b1,
  names: 0x7f4a7c15,
} as const;
const RUN_SEED_MULTIPLIER = 2246822519;
export const streamSeed = (seed: number, stream: keyof typeof STREAM_SALT) =>
  (seed ^ STREAM_SALT[stream]) >>> 0;
/** Each fishing run gets its own seed from the world seed and its ID serial. */
export const runSeed = (worldSeed: number, serial: number) =>
  (worldSeed ^ Math.imul(serial, RUN_SEED_MULTIPLIER)) >>> 0;

/** Stable uint32 LCG for simulation streams; not cryptographic or generative randomness. */
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
