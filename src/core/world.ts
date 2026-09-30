import type { CatBreed } from '../content/breeds';
import type { CatAppearance } from '../content/cats';
import { CITY_START } from '../content/city';
import { WORLD_LIMIT } from './limits';
import { generateCityMap, gridDistance, shoreTiles, tileAt } from './city/map';
import { initialFishing } from './fishing/schema';
import { instantiateCat } from './cats';
import { STARTER_CAT_ID } from '../content/cats';
import {
  commandSchema,
  CommandError,
  type CheckResult,
  type CommandResult,
} from './commands';
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
    const outcome = this.run(input);
    if (!outcome.result.ok) return outcome.result;
    this.state = outcome.next;
    return outcome.result;
  }

  /** Dry run on a copy, e.g. to explain a disabled action; the world never changes. */
  check(input: unknown): CheckResult {
    const { result } = this.run(input);
    return result.ok ? { ok: true } : result;
  }

  private run(input: unknown): { result: CommandResult; next: WorldState } {
    const next = copy(this.state);
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success)
      return { result: { ok: false, error: 'INVALID_COMMAND' }, next };
    try {
      const events = applyCommand(next, parsed.data);
      return { result: { ok: true, events }, next: assertWorld(next) };
    } catch (error) {
      if (error instanceof CommandError)
        return { result: { ok: false, error: error.code }, next };
      // Overflow is a rejected command; unexpected implementation errors remain visible.
      if (next.coins > WORLD_LIMIT || next.nextId > WORLD_LIMIT)
        return { result: { ok: false, error: 'WORLD_LIMIT' }, next };
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

/** The stray a new game starts with: the breed and look the player picked (T-14). */
export interface Stray {
  breed: CatBreed;
  appearance: CatAppearance;
}

/**
 * A new game from its seed. Mochi is the stray the player picked, the one time a breed is
 * chosen; without a pick it is its template (tests, and the test build's new game).
 */
export function createWorld(seed: number, stray?: Stray): World {
  const map = generateCityMap(seed);
  const { crossroads } = CITY_START;
  const distanceFromStarterRoad = (position: Position) =>
    gridDistance(position, crossroads);
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
  if (stray) {
    mochi.breedId = stray.breed;
    mochi.appearance = { ...stray.appearance };
  }
  return new World({
    seed,
    minute: CITY_START.minute,
    coins: CITY_START.coins,
    nextId: 1,
    map,
    buildings: [],
    cats: [mochi],
    residents: [],
    fishing: initialFishing(),
  });
}

export function loadWorld(serialized: string): World {
  const save = saveSchema.parse(JSON.parse(serialized));
  return new World(save.world);
}
