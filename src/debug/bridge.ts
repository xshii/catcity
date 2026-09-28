import type { GameSession } from '../application';
import { createWorld } from '../core';
import type { Position } from '../core';

interface ViewObserver {
  tileScreenPosition: (position: Position) => Position | null;
}

function createBridge(session: GameSession, view?: ViewObserver) {
  return {
    version: 1,
    buildVersion: __BUILD_VERSION__,
    getWorldState: () => session.getSnapshot(),
    getEntity: (id: string) => {
      const world = session.getSnapshot();
      return (
        [...world.cats, ...world.buildings].find((item) => item.id === id) ??
        null
      );
    },
    getCurrentSeed: () => session.getSnapshot().seed,
    getTileScreenPosition: (position: Position) =>
      Number.isInteger(position.x) && Number.isInteger(position.y)
        ? (view?.tileScreenPosition(position) ?? null)
        : null,
    advanceTime: (minutes: number) =>
      session.execute({ type: 'ADVANCE_TIME', minutes }),
    loadFixture: (fixture: { seed: number } | { save: string }) =>
      session.loadFixture(
        'save' in fixture ? fixture.save : createWorld(fixture.seed).save(),
      ),
    spawnCat: (position: Position) =>
      session.execute({ type: 'DEBUG_SPAWN_CAT', position }),
    addCoins: (amount: number) =>
      session.execute({ type: 'DEBUG_ADD_COINS', amount }),
    getSelectedEntity: () => session.selectedEntity,
    getDiagnostics: () => session.getDiagnostics(),
    getReplay: () => session.getReplay(),
  };
}

export function installDebugBridge(session: GameSession, view?: ViewObserver) {
  Object.defineProperty(window, 'CAT_CITY_DEBUG', {
    value: Object.freeze(createBridge(session, view)),
    configurable: false,
  });
}
export type CatCityDebug = ReturnType<typeof createBridge>;
declare global {
  interface Window {
    CAT_CITY_DEBUG?: CatCityDebug;
  }
}
