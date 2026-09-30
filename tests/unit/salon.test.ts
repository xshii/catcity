import { describe, expect, it } from 'vitest';
import type { CatAppearance } from '../../src/content/cats';
import {
  BUILDINGS,
  buildingPrice,
  MAX_SALONS,
  RESTYLE_PRICE,
} from '../../src/content/city';
import {
  createWorld,
  loadWorld,
  World,
  type CommandResult,
  type ErrorCode,
  type GameCommand,
  type WorldState,
} from '../../src/core';
import { cafeAssignment } from '../../src/core/city';
import { FISHING } from '../../src/content/fishing';
import { greenZone } from '../../src/minigames/angling';
import { invite } from '../helpers/world';

// Spec 041 T-15 (cat-looks.md 3, R-18): the cat salon, and restyling a companion there.

/** Seed 42's starter district: owned plots beside a road. */
const SALON_PLOT = { x: 4, y: 4 };
const OTHER_PLOT = { x: 6, y: 4 };
const buildSalon = (world: World, position = SALON_PLOT) =>
  world.dispatch({
    type: 'BUILD_BUILDING',
    buildingType: 'CAT_SALON',
    position,
  });
/** A new game with a salon on the plot and `coins` left over. */
function withSalon(coins = 1000): World {
  const world = new World({ ...createWorld(42).getSnapshot(), coins: 10_000 });
  expect(buildSalon(world).ok).toBe(true);
  return new World({ ...world.getSnapshot(), coins });
}
/** Mochi's template look is cream, solid, blue-eyed and round: this changes all five. */
const TUXEDO: CatAppearance = {
  colour: 'black',
  pattern: 'tabby',
  white: 'mittens',
  eyes: 'green',
  face: 'pointed',
};
const restyle = (
  world: World,
  appearance: unknown = TUXEDO,
  catId = 'mochi',
): CommandResult => world.dispatch({ type: 'RESTYLE_CAT', catId, appearance });
/** Rejected with `error`, and the world exactly as it was: coins, cats, ids and all. */
function rejects(world: World, command: unknown, error: ErrorCode) {
  const before = world.save();
  expect(world.dispatch(command)).toEqual({ ok: false, error });
  expect(world.save()).toBe(before);
}
/** The world with every cat's look set aside: what a look may not change. */
const lookless = (state: WorldState) => ({
  ...state,
  cats: state.cats.map((cat) => ({ ...cat, appearance: null })),
});

describe('the cat salon (cat-looks.md 3)', () => {
  it('is built once per city, at its price in content', () => {
    const world = new World({
      ...createWorld(42).getSnapshot(),
      coins: 10_000,
    });
    const price = buildingPrice('CAT_SALON', 0);
    expect(price).toBe(BUILDINGS.CAT_SALON.basePrice);
    expect(MAX_SALONS).toBe(1);
    const built = buildSalon(world);
    const salon = world.getSnapshot().buildings[0]!;
    expect(salon.type).toBe('CAT_SALON');
    expect(built).toEqual({
      ok: true,
      events: [
        {
          type: 'BuildingBuilt',
          minute: world.getSnapshot().minute,
          entityId: salon.id,
          cost: price,
        },
      ],
    });
    expect(world.getSnapshot().coins).toBe(10_000 - price);
    // A second one is refused, wherever it would go; the first moves like any building.
    rejects(
      world,
      {
        type: 'BUILD_BUILDING',
        buildingType: 'CAT_SALON',
        position: OTHER_PLOT,
      },
      'BUILDING_LIMIT',
    );
    expect(
      world.dispatch({
        type: 'MOVE_BUILDING',
        buildingId: salon.id,
        position: OTHER_PLOT,
      }).ok,
    ).toBe(true);
    // Other buildings still go up beside it.
    expect(
      world.dispatch({
        type: 'BUILD_BUILDING',
        buildingType: 'CAT_CAFE',
        position: SALON_PLOT,
      }).ok,
    ).toBe(true);
  });

  it('is nobody’s home and nobody’s cafe', () => {
    const world = withSalon();
    const salon = world.getSnapshot().buildings[0]!;
    rejects(
      world,
      { type: 'ASSIGN_HOME', catId: 'mochi', buildingId: salon.id },
      'HOME_NOT_FOUND',
    );
    rejects(world, { type: 'INVITE_CAT', definitionId: 'PEPPER' }, 'NO_BED');
    expect(cafeAssignment(world.getSnapshot()).has(salon.id)).toBe(false);
  });

  it('is saved, and a save with a second one is refused', () => {
    const world = withSalon();
    expect(loadWorld(world.save()).save()).toBe(world.save());
    const save = JSON.parse(world.save());
    save.world.buildings.push({
      id: `building-${save.world.nextId}`,
      type: 'CAT_SALON',
      position: OTHER_PLOT,
      builtAtMinute: save.world.minute,
    });
    save.world.nextId++;
    expect(() => loadWorld(JSON.stringify(save))).toThrow(/salon/);
  });
});

describe('restyling a cat (RESTYLE_CAT)', () => {
  it('is refused without a salon', () => {
    rejects(
      createWorld(42),
      { type: 'RESTYLE_CAT', catId: 'mochi', appearance: TUXEDO },
      'NO_SALON',
    );
  });

  it('is refused for a cat not in the city', () => {
    rejects(
      withSalon(),
      { type: 'RESTYLE_CAT', catId: 'ghost', appearance: TUXEDO },
      'CAT_NOT_FOUND',
    );
  });

  it('is refused one coin short, and takes the last coin', () => {
    expect(RESTYLE_PRICE).toBe(50);
    rejects(
      withSalon(RESTYLE_PRICE - 1),
      { type: 'RESTYLE_CAT', catId: 'mochi', appearance: TUXEDO },
      'INSUFFICIENT_COINS',
    );
    const world = withSalon(RESTYLE_PRICE);
    expect(restyle(world).ok).toBe(true);
    expect(world.getSnapshot().coins).toBe(0);
  });

  it('is refused when the look would stay the same', () => {
    const world = withSalon();
    const same = world.getSnapshot().cats[0]!.appearance;
    rejects(
      world,
      { type: 'RESTYLE_CAT', catId: 'mochi', appearance: same },
      'APPEARANCE_UNCHANGED',
    );
    // Coins are judged first: a card can ask whether a cat could be restyled at all.
    rejects(
      withSalon(0),
      { type: 'RESTYLE_CAT', catId: 'mochi', appearance: same },
      'INSUFFICIENT_COINS',
    );
  });

  it('charges every time and changes the five choices, nothing else', () => {
    const rich = withSalon(10_000);
    const pepper = invite(rich);
    const city = new World({ ...rich.getSnapshot(), coins: 1000 });
    const before = city.getSnapshot();
    expect(restyle(city)).toEqual({
      ok: true,
      events: [
        {
          type: 'CatRestyled',
          minute: before.minute,
          entityId: 'mochi',
          cost: RESTYLE_PRICE,
        },
      ],
    });
    const after = city.getSnapshot();
    expect(after.cats[0]!.appearance).toEqual(TUXEDO);
    expect(after.cats[0]!.breedId).toBe(before.cats[0]!.breedId);
    expect(after.coins).toBe(before.coins - RESTYLE_PRICE);
    expect(lookless(after)).toEqual(
      lookless({ ...before, coins: before.coins - RESTYLE_PRICE }),
    );
    // Any companion, as often as the coins last; one change is enough.
    const collar = { ...before.cats[1]!.appearance, white: 'bib' } as const;
    expect(restyle(city, collar, pepper.id).ok).toBe(true);
    expect(restyle(city, { ...TUXEDO, face: 'round' }).ok).toBe(true);
    const last = city.getSnapshot();
    expect(last.coins).toBe(before.coins - 3 * RESTYLE_PRICE);
    expect(last.cats[1]!.appearance).toEqual(collar);
    expect(last.cats[0]!.appearance).toEqual({ ...TUXEDO, face: 'round' });
    expect(loadWorld(city.save()).save()).toBe(city.save());
  });

  it('never changes the breed: it takes a cat and the five choices, nothing more', () => {
    const world = withSalon();
    const command = { type: 'RESTYLE_CAT', catId: 'mochi', appearance: TUXEDO };
    for (const tampered of [
      { ...command, breedId: 'BRITISH_SHORTHAIR' },
      { ...command, appearance: { ...TUXEDO, breedId: 'BRITISH_SHORTHAIR' } },
      { ...command, appearance: { ...TUXEDO, colour: 'purple' } },
      { ...command, appearance: { ...TUXEDO, face: undefined } },
    ])
      rejects(world, tampered, 'INVALID_COMMAND');
  });

  it('changes no number: the same play after it comes out the same', () => {
    // Two worlds alike but for Mochi's look: one restyled, one that paid the same.
    const restyled = withSalon(1000);
    expect(restyle(restyled).ok).toBe(true);
    const plain = withSalon(1000 - RESTYLE_PRICE);
    expect(lookless(restyled.getSnapshot())).toEqual(
      lookless(plain.getSnapshot()),
    );
    const both = (command: GameCommand) => {
      const result = restyled.dispatch(command);
      expect(plain.dispatch(command)).toEqual(result);
      return result;
    };
    // A run at the pond, played to its end; time, a chat and a round of petting.
    both({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'BREAD',
      direction: -20,
      aimDepth: 50,
      spotId: 'POND',
    });
    // A steady hand, as the fishing fixtures play (tests/helpers/fishing-progress.ts).
    for (let step = 0; step < 600; step++) {
      const run = restyled.getSnapshot().fishing.active;
      if (!run) break;
      const zone = greenZone(run);
      both({
        type: 'FISH_CONTROL',
        runId: run.id,
        pressed:
          run.phase === 'charge'
            ? run.tick < 23
            : run.phase === 'hook'
              ? run.cursor >= zone.low && run.cursor <= zone.high
              : run.phase === 'fight' &&
                run.tension < (zone.low + zone.high) / 2,
        ticks: run.phase === 'waiting' ? FISHING.input.maxTicks : 1,
      });
    }
    expect(restyled.getSnapshot().fishing.lastResult).not.toBeNull();
    both({ type: 'ADVANCE_TIME', minutes: 600 });
    both({ type: 'INTERACT', catId: 'mochi', message: '你好', reply: '喵' });
    both({
      type: 'PET_CAT',
      catId: 'mochi',
      strokes: [0, 20, 40, 60].map((tick) => ({ tick, spot: 'HEAD' })),
    });
    expect(lookless(restyled.getSnapshot())).toEqual(
      lookless(plain.getSnapshot()),
    );
  });
});
