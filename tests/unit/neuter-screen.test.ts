import { describe, expect, it } from 'vitest';
import { NEUTER_PRICE } from '../../src/content/family';
import type { CheckResult, ErrorCode, WorldState } from '../../src/core';
import { neuterScreen } from '../../src/view/cats/neuter-screen';
import { ERROR_MESSAGES } from '../../src/view/common/errors';
import { readyPair } from '../helpers/family';

// Spec 041 T-20 (ui-design 4.2, 4.3, 5.2): the way to neuter under a cat's family, and
// what its confirmation says. Whether Core would take the command is a dry run's.

const world: WorldState = { ...readyPair().getSnapshot(), coins: 42 };
const ok = (): CheckResult => ({ ok: true });
const fails = (error: ErrorCode) => (): CheckResult => ({ ok: false, error });
const entry = (check: () => CheckResult, catId = 'mochi') =>
  neuterScreen(world, catId, check);

describe('neutering in a cat’s family (spec 041 T-20)', () => {
  it('offers the button while Core would take the command, and asks it about this cat', () => {
    const asked: unknown[] = [];
    const shown = neuterScreen(world, 'mochi', (command) => {
      asked.push(command);
      return { ok: true };
    });
    expect(asked).toEqual([{ type: 'NEUTER_CAT', catId: 'mochi' }]);
    expect(shown).toMatchObject({
      button: true,
      text: '绝育…',
      label: '给 Mochi 做绝育',
      disabled: false,
      reason: '',
      status: '',
    });
  });

  it('says what follows, that it cannot be undone, the price and the act (ui-design 4.2)', () => {
    expect(entry(ok)!.confirm).toEqual({
      title: '给 Mochi 做绝育？',
      body: ['做了之后 Mochi 不能再生小猫。', '这件事不能撤销。'],
      cost: `花费 ${NEUTER_PRICE} 金币`,
      confirm: '确定绝育',
    });
    expect(entry(ok)!.done).toBe('Mochi 做好了绝育。');
    expect(entry(ok, world.cats[1]!.id)!.confirm.title).toBe(
      '给 Pepper 做绝育？',
    );
  });

  it('turns the button off with what is missing when the coins are short (ui-design 4.3)', () => {
    expect(entry(fails('INSUFFICIENT_COINS'))).toMatchObject({
      button: true,
      disabled: true,
      reason: `金币不足：需要 ${NEUTER_PRICE}，现有 42。`,
      status: '',
    });
  });

  it('puts a line in the button’s place once neutered, and for a kitten (ui-design 5.2)', () => {
    expect(entry(fails('ALREADY_NEUTERED'))).toMatchObject({
      button: false,
      reason: '',
      status: '已绝育',
    });
    expect(entry(fails('CAT_TOO_YOUNG'))).toMatchObject({
      button: false,
      reason: '',
      status: '长大后才可以',
    });
  });

  it('gives any other rejection in the player’s words', () => {
    expect(entry(fails('CAT_BUSY'))).toMatchObject({
      button: true,
      disabled: true,
      reason: ERROR_MESSAGES.CAT_BUSY,
    });
  });

  it('shows nothing for a cat that is not in the city', () => {
    expect(entry(ok, 'gone')).toBeNull();
  });
});
