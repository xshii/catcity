import { NEUTER_PRICE } from '../../content/family';
import type { CheckResult, GameCommand, WorldState } from '../../core';
import type { ConfirmContent } from '../common/confirm';
import { ERROR_MESSAGES } from '../common/errors';
import { INVITE_COPY } from './invite-screen';

/** Words of neutering, in a cat's family section and its confirmation (ui-design 4.2, 5.2). */
const NEUTER_COPY = {
  button: '绝育…',
  label: (name: string) => `给 ${name} 做绝育`,
  neutered: '已绝育',
  kitten: '长大后才可以',
  title: (name: string) => `给 ${name} 做绝育？`,
  after: (name: string) => `做了之后 ${name} 不能再生小猫。`,
  undo: '这件事不能撤销。',
  cost: (price: number) => `花费 ${price} 金币`,
  confirm: '确定绝育',
  done: (name: string) => `${name} 做好了绝育。`,
} as const;

/**
 * The way to neuter a cat, under its family (spec 041 R-30): a button while Core would take
 * the command, off with what is missing while it would not (ui-design 4.3), and a line in
 * its place once the cat is neutered or while it is a kitten (5.2). `check` is a dry run;
 * null for a cat not in the city.
 */
export function neuterScreen(
  world: WorldState,
  catId: string,
  check: (command: GameCommand) => CheckResult,
) {
  const cat = world.cats.find((item) => item.id === catId);
  if (!cat) return null;
  const result = check({ type: 'NEUTER_CAT', catId });
  const error = result.ok ? null : result.error;
  const status =
    error === 'ALREADY_NEUTERED'
      ? NEUTER_COPY.neutered
      : error === 'CAT_TOO_YOUNG'
        ? NEUTER_COPY.kitten
        : '';
  return {
    button: !status,
    text: NEUTER_COPY.button,
    label: NEUTER_COPY.label(cat.name),
    disabled: !!error,
    reason:
      !error || status
        ? ''
        : error === 'INSUFFICIENT_COINS'
          ? INVITE_COPY.short(NEUTER_PRICE, world.coins)
          : ERROR_MESSAGES[error],
    status,
    confirm: {
      title: NEUTER_COPY.title(cat.name),
      body: [NEUTER_COPY.after(cat.name), NEUTER_COPY.undo],
      cost: NEUTER_COPY.cost(NEUTER_PRICE),
      confirm: NEUTER_COPY.confirm,
    } satisfies ConfirmContent,
    /** The notice once it is done. */
    done: NEUTER_COPY.done(cat.name),
  };
}
