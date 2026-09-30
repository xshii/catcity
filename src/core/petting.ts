import { PETTING, PET_SPOTS } from '../content/petting';
import {
  pettingOutcome,
  playPetting,
  type PetTastes,
} from '../minigames/petting';
import { BOND } from '../content/care';
import { rewardBond, spendDaily } from './bond';
import { requireCat } from './cats';
import { liftMood } from './mood';
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
  // A good round counts toward the bond for the first rounds of a game day; like a gift
  // or a chat, it reads the cat's mood as the round begins.
  const counted =
    outcome.good &&
    spendDaily(cat.pettingBond, world.minute, BOND.pettingPerDay);
  if (counted) {
    cat.pettingBond = counted;
    rewardBond(cat, BOND.petting);
  }
  const hour = Math.floor(world.minute / LIMIT.hourMinutes);
  const played = cat.petting.hour === hour ? cat.petting.rounds : 0;
  const full = played < LIMIT.fullRounds;
  // Later rounds give half, never less than 1, and a happy cat half of that again, as
  // every gain; what an unkind round takes stays whole.
  const before = cat.mood;
  if (outcome.mood < 0) cat.mood = Math.max(0, cat.mood + outcome.mood);
  else
    liftMood(
      cat,
      full ? outcome.mood : Math.max(1, Math.floor(outcome.mood / 2)),
    );
  cat.petting = {
    discovered: PET_SPOTS.filter(
      (spot) =>
        cat.petting.discovered.includes(spot) || outcome.touched.includes(spot),
    ),
    hour,
    rounds: Math.min(LIMIT.fullRounds, played + 1),
  };
  return [
    {
      type: 'CatPetted',
      minute: world.minute,
      entityId: cat.id,
      // The command has at least one stroke, and the first is always taken.
      spot: outcome.spot!,
      meter: outcome.meter,
      mood: cat.mood - before,
      full,
    },
  ];
}
