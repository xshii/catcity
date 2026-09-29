import { MAX_STAT } from './limits';
import { PETTING, PET_SPOTS } from '../content/petting';
import {
  pettingOutcome,
  playPetting,
  type PetTastes,
} from '../minigames/petting';
import { rewardBond } from './bond';
import { requireCat } from './cats';
import { CommandError, type GameCommand, type GameEvent } from './commands';
import { RandomService, streamSeed } from './random';
import type { WorldState } from './schema';

const { limit: LIMIT } = PETTING;

/** FNV-1a over the id's characters: a cat's own number within its world. */
const idNumber = (id: string) =>
  Array.from(id).reduce(
    (hash, letter) => Math.imul(hash ^ letter.charCodeAt(0), 16777619) >>> 0,
    2166136261,
  );

/**
 * The spots this cat loves and dislikes (spec 039): fixed by the world seed and the
 * cat's id, so they are derived whenever needed and never saved.
 */
export function pettingTastes(seed: number, catId: string): PetTastes {
  const random = new RandomService(
    (streamSeed(seed, 'petting') ^ idNumber(catId)) >>> 0,
  );
  // The first draws of neighbouring seeds lie close together.
  for (let warm = 0; warm < 4; warm++) random.nextInt(2);
  const favourite = PET_SPOTS[random.nextInt(PET_SPOTS.length)]!;
  const others = PET_SPOTS.filter((spot) => spot !== favourite);
  return { favourite, disliked: others[random.nextInt(others.length)]! };
}

/** Settles one round from its strokes; nothing of a round exists before this. */
export function petCat(
  world: WorldState,
  command: Extract<GameCommand, { type: 'PET_CAT' }>,
): GameEvent[] {
  const cat = requireCat(world, command.catId);
  if (world.fishing.active?.catId === cat.id)
    throw new CommandError('CAT_BUSY');
  const outcome = pettingOutcome(
    playPetting(pettingTastes(world.seed, cat.id), command.strokes),
  );
  const hour = Math.floor(world.minute / LIMIT.hourMinutes);
  const played = cat.petting.hour === hour ? cat.petting.rounds : 0;
  const full = played < LIMIT.fullRounds;
  // Later rounds give half, never less than 1; what an unkind round takes stays.
  const mood =
    full || outcome.mood < 0
      ? outcome.mood
      : Math.max(1, Math.floor(outcome.mood / 2));
  cat.mood = Math.max(0, Math.min(MAX_STAT, cat.mood + mood));
  cat.petting = {
    discovered: PET_SPOTS.filter(
      (spot) =>
        cat.petting.discovered.includes(spot) || outcome.touched.includes(spot),
    ),
    hour,
    rounds: Math.min(LIMIT.fullRounds, played + 1),
  };
  if (outcome.good) rewardBond(cat, world.minute);
  return [
    {
      type: 'CatPetted',
      minute: world.minute,
      entityId: cat.id,
      // The command has at least one stroke, and the first is always taken.
      spot: outcome.spot!,
      meter: outcome.meter,
      mood,
      full,
    },
  ];
}
