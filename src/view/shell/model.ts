import { CAT_BREEDS } from '../../content/breeds';
import type { WorldState } from '../../core';

export function toViewModel(world: WorldState, selected: string | null) {
  const cat = world.cats.find((item) => item.id === selected);
  return {
    coins: world.coins.toLocaleString('en-US'),
    day: Math.floor(world.minute / 1440) + 1,
    time: `${String(Math.floor(world.minute / 60) % 24).padStart(2, '0')}:${String(world.minute % 60).padStart(2, '0')}`,
    cafeBuilt: world.buildings.some((building) => building.type === 'CAT_CAFE'),
    cat: cat
      ? {
          ...cat,
          moodLabel: cat.mood >= 60 ? '心情不错' : '想安静一会儿',
          personalityLabel:
            CAT_BREEDS[cat.breedId].name +
            ' · ' +
            (cat.definitionId === 'PEPPER'
              ? '好奇 · 活泼 · 爱冒险'
              : '胆小 · 贪吃 · 慢热'),
        }
      : null,
  };
}
