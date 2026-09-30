import type { GameSession } from '../application';
import { CAT_BREED_IDS } from '../content/breeds';
import { APPEARANCE_OPTIONS, type CatAppearance } from '../content/cats';
import { createWorld } from '../core';
import type { Position } from '../core';
import { mountCatMaker } from '../view/cats/cat-maker';
import type { CatChoice, CatMakerInput } from '../view/cats/cat-maker-screen';

interface ViewObserver {
  tileScreenPosition: (position: Position) => Position | null;
  fishingClock: {
    setManual: (manual: boolean) => void;
    step: (ticks: number) => number;
  };
  pettingClock: {
    setManual: (manual: boolean) => void;
    step: (ticks: number) => number;
  };
}
/** Largest single step; one fishing run never needs more ticks than this. */
const MAX_STEP_TICKS = 1000;

/** A cat maker input from a test: a breed and five choices the art draws. */
function makerInput(input: CatMakerInput) {
  const items = Object.keys(APPEARANCE_OPTIONS) as (keyof CatAppearance)[];
  return (
    typeof input?.pickBreed === 'boolean' &&
    typeof input.confirm === 'string' &&
    CAT_BREED_IDS.includes(input.breed) &&
    items.every((item) =>
      (APPEARANCE_OPTIONS[item] as readonly string[]).includes(
        input.appearance?.[item],
      ),
    )
  );
}

function createBridge(session: GameSession, view?: ViewObserver) {
  let maker: HTMLElement | null = null;
  /** What the last cat maker gave: the choice, null if cancelled, undefined while open. */
  let made: CatChoice | null | undefined;
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
    /** Test-build clock control: ticks advance only via stepFishing, inputs stay real. */
    useManualFishingClock: (manual: boolean) =>
      view?.fishingClock.setManual(manual === true),
    stepFishing: (ticks: number) =>
      Number.isInteger(ticks) && ticks >= 1 && ticks <= MAX_STEP_TICKS
        ? (view?.fishingClock.step(ticks) ?? 0)
        : 0,
    /** The same for a round of petting: strokes stay real, ticks come from the test. */
    useManualPettingClock: (manual: boolean) =>
      view?.pettingClock.setManual(manual === true),
    stepPetting: (ticks: number) =>
      Number.isInteger(ticks) && ticks >= 1 && ticks <= MAX_STEP_TICKS
        ? (view?.pettingClock.step(ticks) ?? 0)
        : 0,
    /**
     * The cat maker over the page (spec 041 T-14; the game opens it from PR 2 on). Its 🎲
     * takes `randoms` in turn when given, each in [0, 1). Changes nothing in the world.
     */
    showCatMaker: (input: CatMakerInput, randoms: readonly number[] = []) => {
      if (!makerInput(input) || !randoms.every((n) => n >= 0 && n < 1))
        return false;
      let next = 0;
      maker?.remove();
      made = undefined;
      maker = mountCatMaker({
        // Where the petting screen floats, under the settings gear.
        layer: document.querySelector<HTMLElement>('.shell') ?? document.body,
        input,
        random: randoms.length
          ? () => randoms[next++ % randoms.length]!
          : Math.random,
        done: (choice) => (made = choice),
      });
      return true;
    },
    getCatMakerOutcome: () => made,
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
