import { expect, it } from 'vitest';
import { fishingFixture } from './fishing-fixture';

it.each(['catId', 'baitId', 'direction', 'spotId', 'aimDepth'])(
  'rejects a missing explicit fishing %s without spending energy, bait or IDs',
  (field) => {
    const world = fishingFixture(42);
    const before = world.save();
    const command: Record<string, unknown> = {
      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'WORM',
      direction: -30,
      spotId: 'POND',
      aimDepth: 50,
    };
    delete command[field];
    expect(world.dispatch(command)).toEqual({
      ok: false,
      error: 'INVALID_COMMAND',
    });
    expect(world.save()).toBe(before);
    command[field] = undefined;
    expect(world.dispatch(command)).toEqual({
      ok: false,
      error: 'INVALID_COMMAND',
    });
    expect(world.save()).toBe(before);
  },
);
