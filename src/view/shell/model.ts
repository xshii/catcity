import { CAT_BREEDS } from '../../content/breeds';
import { CAT_DEFINITIONS } from '../../content/cats';
import type { WorldState } from '../../core';
import { bondBadge } from './bond';
import { moodBadge } from './mood';

export function toViewModel(world: WorldState, selected: string | null) {
  const cat = world.cats.find((item) => item.id === selected);
  return {
    coins: world.coins.toLocaleString('en-US'),
    day: Math.floor(world.minute / 1440) + 1,
    time: `${String(Math.floor(world.minute / 60) % 24).padStart(2, '0')}:${String(world.minute % 60).padStart(2, '0')}`,
    cat: cat
      ? {
          ...cat,
          moodBadge: moodBadge(cat.mood),
          bondBadge: bondBadge(cat.playerBond),
          personalityLabel: `${CAT_BREEDS[cat.breedId].name} · ${CAT_DEFINITIONS[cat.definitionId].personalityLabel}`,
        }
      : null,
  };
}
