import { instantiateMochi } from '../content/definitions';
import { commandSchema, CommandError, type CommandResult } from './commands';
import { RandomService } from './random';
import { applyCommand } from './reducer';
import {
  assertWorld,
  saveSchema,
  type Position,
  type WorldState,
} from './schema';

const copy = (state: WorldState): WorldState =>
  JSON.parse(JSON.stringify(state)) as WorldState;

export class World {
  private state: WorldState;

  constructor(state: WorldState) {
    this.state = assertWorld(state);
  }

  getSnapshot(): WorldState {
    return copy(this.state);
  }

  dispatch(input: unknown): CommandResult {
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'INVALID_COMMAND' };
    const next = copy(this.state);
    try {
      const events = applyCommand(next, parsed.data);
      this.state = assertWorld(next);
      return { ok: true, events };
    } catch (error) {
      if (error instanceof CommandError)
        return { ok: false, error: error.message };
      // Overflow is a rejected command; unexpected implementation errors remain visible.
      if (next.coins > 1_000_000_000 || next.nextId > 1_000_000_000)
        return { ok: false, error: 'WORLD_LIMIT' };
      throw error;
    }
  }

  build(position: Position): CommandResult {
    return this.dispatch({ type: 'BUILD_CAFE', position });
  }
  advanceTime(minutes: number): CommandResult {
    return this.dispatch({ type: 'ADVANCE_TIME', minutes });
  }
  interact(catId: string, message: string, reply: string): CommandResult {
    return this.dispatch({ type: 'INTERACT', catId, message, reply });
  }
  save(): string {
    return JSON.stringify({
      saveVersion: 1,
      contentVersion: 1,
      world: this.state,
    });
  }
}

export function createWorld(seed: number): World {
  const rng = new RandomService(seed);
  return new World({
    seed,
    rngState: rng.state,
    minute: 0,
    coins: 1000,
    nextId: 1,
    map: { width: 10, height: 10 },
    buildings: [],
    cats: [instantiateMochi('mochi', { x: 5, y: 5 })],
  });
}

export function loadWorld(serialized: string): World {
  const save = saveSchema.parse(JSON.parse(serialized));
  return new World(save.world);
}
