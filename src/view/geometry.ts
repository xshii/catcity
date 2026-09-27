export const MAP_VIEW = { size: 640, origin: 60, tile: 52 } as const;
export function tileCenter(x: number, y: number) {
  return {
    x: MAP_VIEW.origin + (x + 0.5) * MAP_VIEW.tile,
    y: MAP_VIEW.origin + (y + 0.5) * MAP_VIEW.tile,
  };
}
