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
