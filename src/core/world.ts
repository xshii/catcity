import { CITY_START } from '../content/city';
import { WORLD_LIMIT } from './limits';
import { generateCityMap, shoreTiles, tileAt } from './city/map';
import { initialFishing } from './fishing/schema';
import { instantiateCat } from './cats';
import { STARTER_CAT_ID } from '../content/cats';
import { commandSchema, CommandError, type CommandResult } from './commands';
import { applyCommand } from './reducer';
import {
  assertWorld,
  SAVE_VERSION,
  CONTENT_VERSION,
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
        return { ok: false, error: error.code };
      // Overflow is a rejected command; unexpected implementation errors remain visible.
      if (next.coins > WORLD_LIMIT || next.nextId > WORLD_LIMIT)
        return { ok: false, error: 'WORLD_LIMIT' };
      throw error;
    }
  }

  save(): string {
    return JSON.stringify({
      saveVersion: SAVE_VERSION,
      contentVersion: CONTENT_VERSION,
      world: this.state,
    });
  }
}

export function createWorld(seed: number): World {
  const map = generateCityMap(seed);
  const { crossroads } = CITY_START;
  const distanceFromStarterRoad = (position: Position) =>
    Math.abs(position.x - crossroads.x) + Math.abs(position.y - crossroads.y);
  const start = shoreTiles(map, 'POND')
    .filter((position) => !tileAt(map, position)?.owned)
    .sort(
      (a, b) =>
        distanceFromStarterRoad(a) - distanceFromStarterRoad(b) ||
        a.y - b.y ||
        a.x - b.x,
    )[0];
  if (!start) throw new Error('Missing unowned pond shore');
  const mochi = instantiateCat('MOCHI', STARTER_CAT_ID, start);
  mochi.fishingSpotId = 'POND';
  return new World({
    seed,
    minute: 0,
    coins: CITY_START.coins,
    nextId: 1,
    map,
    buildings: [],
    cats: [mochi],
    fishing: initialFishing(),
  });
}

export function loadWorld(serialized: string): World {
  const save = saveSchema.parse(JSON.parse(serialized));
  return new World(save.world);
}
