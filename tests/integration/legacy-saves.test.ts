import { expect, it } from 'vitest';
import { createWorld, loadWorld } from '../../src/core';
import { CONTENT_VERSION, SAVE_VERSION } from '../../src/core/schema';
import { createTestSession } from '../helpers/session';
import v1 from '../fixtures/save-v1.json';
import v2 from '../fixtures/save-v2.json';
import v3 from '../fixtures/save-v3.json';
import v4 from '../fixtures/save-v4.json';
import v5 from '../fixtures/save-v5.json';
import v6 from '../fixtures/save-v6.json';
import v7 from '../fixtures/save-v7.json';
import v8 from '../fixtures/save-v8.json';
import v9 from '../fixtures/save-v9.json';
import v10 from '../fixtures/save-v10.json';
import v11 from '../fixtures/save-v11.json';
import v12 from '../fixtures/save-v12.json';
// Mid-fight save from before the stricter hold rule (content 5).
import v13 from '../fixtures/save-v13.json';
// Road prices changed after this save (content 6).
import v13Content6 from '../fixtures/save-v13-content6.json';
// Mid-charge button run from before casts paid (content 7): it had already paid.
import v13Content7 from '../fixtures/save-v13-content7.json';
// A cat resting under the removed rest rule (save 13); idle cats recover by themselves now.
import v13Rest from '../fixtures/save-v13-rest.json';
// An active motion run from before runs recorded the cat's happy mood (save 14).
import v14 from '../fixtures/save-v14.json';
// A motion fight from before runs tracked line tension (save 15).
import v15 from '../fixtures/save-v15.json';
// A motion fight under line tension from before runs recorded the fish shadow they
// landed on (save 16).
import v16 from '../fixtures/save-v16.json';
// A bond counted once per game hour and a hunger need, from before bond points (save 17).
import v17 from '../fixtures/save-v17.json';
// A walk scheduled under the slower walking minutes (content 8, save 17).
import v17Content8 from '../fixtures/save-v17-content8.json';
// A cafe paid 10 coins an hour without customers, at the flat prices (content 9).
import v18Content9 from '../fixtures/save-v18-content9.json';
// Two cats from before cats carried a petting record (save 18, content 10).
import v18Content10 from '../fixtures/save-v18-content10.json';
// Two cats from before cats carried their own sex, birth, generation and family (save 19).
import v19Content10 from '../fixtures/save-v19-content10.json';
// Pepper invited free and without a bed, from before INVITE_CAT and before a coat
// could be orange or tuxedo (save 20, content 10).
import v20Content10 from '../fixtures/save-v20-content10.json';
// Pepper, 芝麻 and 豆包 invited while 芝麻 was cream and 豆包 gray (save 20, content 11).
import v20Content11 from '../fixtures/save-v20-content11.json';
// Eight cats, the companion limit of content 12; content 13 lets ten live in the city.
import v21Content12 from '../fixtures/save-v21-content12.json';
// A motion fight with the fish off the ring, from before runs counted the time it spent
// outside in a row (save 21, content 13).
import v21Content13 from '../fixtures/save-v21-content13.json';
// Mochi, Pepper and 芝麻 each in one of four coats, from before a look was five choices
// and Mochi the player's stray (save 22, content 14).
import v22Content14 from '../fixtures/save-v22-content14.json';
// A picked stray and Pepper, from before a names table suggested names (content 15).
import v23Content15 from '../fixtures/save-v23-content15.json';

const future = {
  ...JSON.parse(createWorld(42).save()),
  saveVersion: SAVE_VERSION + 1,
};
const incompatible = {
  v1,
  v2,
  v3,
  v4,
  v5,
  v6,
  v7,
  v8,
  v9,
  v10,
  v11,
  v12,
  v13,
  v13Content6,
  v13Content7,
  v13Rest,
  v14,
  v15,
  v16,
  v17,
  v17Content8,
  v18Content9,
  v18Content10,
  v19Content10,
  v20Content10,
  v20Content11,
  v21Content12,
  v21Content13,
  v22Content14,
  v23Content15,
  future,
};

it.each(Object.entries(incompatible))(
  '%s is rejected without migration and kept until an explicit reset',
  (_, fixture) => {
    const original = JSON.stringify(fixture);
    expect(() => loadWorld(original)).toThrow();
    let data = original;
    const session = createTestSession({
      repository: {
        read: () => data,
        write: (next) => {
          data = next;
        },
      },
    });
    expect(session.storageError).not.toBeNull();
    expect(session.execute({ type: 'ADVANCE_TIME', minutes: 10 }).ok).toBe(
      true,
    );
    expect(data).toBe(original);
    session.resetDemo();
    expect(session.storageError).toBeNull();
    expect(JSON.parse(data)).toMatchObject({
      saveVersion: SAVE_VERSION,
      contentVersion: CONTENT_VERSION,
    });
    expect(loadWorld(data).getSnapshot()).toEqual(
      createWorld(42).getSnapshot(),
    );
    expect(loadWorld(data).save()).toBe(data);
  },
);

it('rejects the coats of content 11 even in the current envelope (content 12)', () => {
  const old = { ...v20Content11, saveVersion: SAVE_VERSION };
  expect(() => loadWorld(JSON.stringify(old))).toThrow(/contentVersion/);
  const coats = { ...old, contentVersion: CONTENT_VERSION };
  // Since T-14 a coat is no look at all: a look is five choices.
  expect(() => loadWorld(JSON.stringify(coats))).toThrow(/colour/);
});

it('rejects the coats of save 22 even in the current envelope', () => {
  const coats = {
    ...v22Content14,
    saveVersion: SAVE_VERSION,
    contentVersion: CONTENT_VERSION,
  };
  expect(() => loadWorld(JSON.stringify(coats))).toThrow(/colour/);
});
