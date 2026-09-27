import type { WorldState } from '../core/schema';

export function toViewModel(world: WorldState, selected: string | null) {
  const cat = world.cats.find((item) => item.id === selected);
  return {
    coins: world.coins.toLocaleString('en-US'),
    day: Math.floor(world.minute / 1440) + 1,
    time: `${String(Math.floor(world.minute / 60) % 24).padStart(2, '0')}:${String(world.minute % 60).padStart(2, '0')}`,
    cafeBuilt: world.buildings.length > 0,
    cat: cat
      ? {
          ...cat,
          moodLabel: cat.mood >= 60 ? '心情不错' : '想安静一会儿',
          personalityLabel: '胆小 · 贪吃 · 慢热',
        }
      : null,
  };
}
