import { z } from 'zod';
import { CAT_NAMES, NAME_MAX_LENGTH, SUGGESTED_NAMES } from '../content/names';
import { RandomService, runSeed, streamSeed } from './random';
import type { WorldState } from './schema';

/**
 * A cat's name (spec 041 R-16, design 5.2.1): 1–12 characters (an emoji is one), no space
 * at either end, no line break or other control character. Renaming, a kitten's naming
 * and the save share it; the name box trims what the player typed before it sends it.
 */
export const catNameSchema = z.string().refine((name) => {
  const length = Array.from(name).length;
  return (
    name === name.trim() &&
    length >= 1 &&
    length <= NAME_MAX_LENGTH &&
    !/\p{Cc}/u.test(name)
  );
}, 'Invalid cat name');

/** What a cat's suggestions shuffle by: its id serial; Mochi's id has none, so 0. */
export const nameSalt = (catId: string): number =>
  Number(/^cat-(\d+)$/.exec(catId)?.[1] ?? 0);

/**
 * Six names to suggest (design 5.2.1): the names table shuffled by the world seed and
 * `salt`, less the names cats in the city have, six at a time. A page is the six after
 * the page before; once the table is used up, the first six come again. Nothing is drawn
 * from the world: the same world, salt and page give the same names.
 */
export function suggestNames(
  world: WorldState,
  salt: number,
  page: number,
): string[] {
  const random = new RandomService(
    runSeed(streamSeed(world.seed, 'names'), salt),
  );
  const names: string[] = [...CAT_NAMES];
  for (let last = names.length - 1; last > 0; last--) {
    const pick = random.nextInt(last + 1);
    [names[last], names[pick]] = [names[pick]!, names[last]!];
  }
  const taken = new Set(world.cats.map((cat) => cat.name));
  const free = names.filter((name) => !taken.has(name));
  const pages = Math.ceil(free.length / SUGGESTED_NAMES);
  const start = (page % pages) * SUGGESTED_NAMES;
  return Array.from(
    { length: SUGGESTED_NAMES },
    (_, i) => free[(start + i) % free.length]!,
  );
}
