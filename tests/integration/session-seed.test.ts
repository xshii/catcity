import { createTestSession } from '../helpers/session';
import { expect, it } from 'vitest';

it('keeps the chosen map seed through persistence and an explicit reset', () => {
  let data: string | null = null;
  const repository = {
    read: () => data,
    write: (save: string) => {
      data = save;
    },
  };
  const session = createTestSession({ repository: repository, seed: 187 });
  const initialMap = session.getSnapshot().map;
  session.execute({ type: 'ADVANCE_TIME', minutes: 10 });
  const restored = createTestSession({ repository: repository, seed: 912 });
  expect(restored.getSnapshot().seed).toBe(187);
  expect(restored.getSnapshot().map).toEqual(initialMap);
  restored.resetDemo();
  expect(restored.getSnapshot().seed).toBe(187);
  expect(restored.getSnapshot().minute).toBe(0);
  expect(restored.getSnapshot().map).toEqual(initialMap);
});
