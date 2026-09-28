import { BUILDINGS, CITY_COSTS } from '../../content/city';
import { samePosition, tileAt } from './map';
import { isWalkable, roadConnectionPath } from './path';
import { replanWalk } from './walking';
import { CommandError, type GameCommand, type GameEvent } from '../commands';
import type { WorldState } from '../schema';

type CityCommand = Extract<
  GameCommand,
  {
    type:
      | 'BUY_LAND'
      | 'BUILD_BUILDING'
      | 'MOVE_BUILDING'
      | 'PLACE_ROAD'
      | 'UPGRADE_ROAD'
      | 'ASSIGN_HOME';
  }
>;

export function applyCity(
  world: WorldState,
  command: CityCommand,
): GameEvent[] {
  const events: GameEvent[] = [];
  const pay = (cost: number) => {
    if (world.coins < cost) throw new CommandError('INSUFFICIENT_COINS');
    world.coins -= cost;
  };
  if (command.type === 'ASSIGN_HOME') {
    const cat = world.cats.find((cat) => cat.id === command.catId);
    if (!cat) throw new CommandError('CAT_NOT_FOUND');
    const building = world.buildings.find(
      (building) => building.id === command.buildingId,
    );
    if (!building || building.type !== 'CAT_APARTMENT')
      throw new CommandError('HOME_NOT_FOUND');
    if (cat.home === building.id) throw new CommandError('ALREADY_HOME');
    if (
      world.cats.filter((cat) => cat.home === building.id).length >=
      BUILDINGS.CAT_APARTMENT.homeCapacity
    )
      throw new CommandError('HOME_FULL');
    cat.home = building.id;
    return [
      {
        type: 'CityChanged',
        minute: world.minute,
        action: 'home-assigned',
        entityId: cat.id,
      },
    ];
  }
  const tile = tileAt(world.map, command.position);
  if (!tile || tile.terrain !== 'GRASS')
    throw new CommandError('INVALID_PLACEMENT');
  if (command.type === 'BUY_LAND') {
    if (tile.owned) throw new CommandError('LAND_ALREADY_OWNED');
    pay(CITY_COSTS.buyLand);
    tile.owned = true;
  } else {
    if (!tile.owned) throw new CommandError('LAND_NOT_OWNED');
    if (command.type === 'PLACE_ROAD' || command.type === 'UPGRADE_ROAD') {
      if (
        world.buildings.some((building) =>
          samePosition(building.position, command.position),
        )
      )
        throw new CommandError('INVALID_PLACEMENT');
      if (command.type === 'PLACE_ROAD') {
        if (tile.road) throw new CommandError('ROAD_EXISTS');
        pay(CITY_COSTS.placeRoad);
        tile.road = 'DIRT';
      } else {
        if (tile.road !== 'DIRT') throw new CommandError('DIRT_ROAD_REQUIRED');
        pay(CITY_COSTS.upgradeRoad);
        tile.road = 'STONE';
      }
    } else {
      if (!isWalkable(world, command.position) || tile.road)
        throw new CommandError('INVALID_PLACEMENT');
      const moved =
        command.type === 'MOVE_BUILDING'
          ? world.buildings.find(
              (building) => building.id === command.buildingId,
            )
          : null;
      if (command.type === 'MOVE_BUILDING' && !moved)
        throw new CommandError('BUILDING_NOT_FOUND');
      if (!moved && world.buildings.length >= 100)
        throw new CommandError('BUILDING_LIMIT');
      // Removing the old footprint is safe on the dispatch copy and permits routes through it.
      const previous = moved?.position;
      if (moved) moved.position = command.position;
      const connection = roadConnectionPath(world, command.position);
      if (!connection) throw new CommandError('ROAD_NOT_CONNECTED');
      for (const position of connection)
        tileAt(world.map, position)!.road ??= 'DIRT';
      if (moved) {
        events.push({
          type: 'CityChanged',
          minute: world.minute,
          action: 'building-moved',
          entityId: moved.id,
        });
      } else if (command.type === 'BUILD_BUILDING') {
        const type = command.buildingType;
        const definition = BUILDINGS[type];
        pay(definition.cost);
        const building = {
          id: `building-${world.nextId++}`,
          type,
          position: command.position,
          builtAtMinute: world.minute,
          incomeProgress: 0,
        };
        world.buildings.push(building);
        events.push({
          type: 'BuildingBuilt',
          minute: world.minute,
          entityId: building.id,
          cost: definition.cost,
        });
      }
      for (const cat of world.cats)
        if (
          cat.walk?.route.some((p) => samePosition(p, command.position)) ||
          (previous && cat.walk)
        )
          replanWalk(world, cat, events);
      return events;
    }
  }
  events.push({
    type: 'CityChanged',
    minute: world.minute,
    action: command.type,
  });
  return events;
}
