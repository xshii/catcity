import { describe, expect, it } from 'vitest';
import type { TraceEntry } from '../../src/application';
import type { GameCommand } from '../../src/core';
import {
  commandLogEntry,
  createLogBatch,
  debugLogWanted,
  sessionId,
} from '../../src/platform/device-log';

describe('device log', () => {
  it('logs only a device that opted in with ?debug=1, until ?debug=0', () => {
    expect(debugLogWanted(null, null)).toBe(false);
    expect(debugLogWanted('1', null)).toBe(true);
    expect(debugLogWanted(null, '1')).toBe(true);
    expect(debugLogWanted('0', '1')).toBe(false);
    expect(debugLogWanted('yes', null)).toBe(false);
  });

  it('keeps a bounded batch, dropping the oldest and saying how many', () => {
    const batch = createLogBatch(3);
    for (let t = 0; t < 5; t++) batch.push({ kind: 'motion', t });
    expect(batch.take()).toEqual({
      entries: [2, 3, 4].map((t) => ({ kind: 'motion', t })),
      dropped: 2,
    });
    expect(batch.take()).toEqual({ entries: [], dropped: 0 });
  });
});

describe('device log session id', () => {
  it('is a UUID-shaped id from random bytes, without a secure context', () => {
    const id = sessionId((bytes) => bytes.fill(171));
    expect(id).toBe('abababab-abab-abab-abab-abababababab');
    // The receiver accepts it as a session name.
    expect(id).toMatch(/^[a-z0-9-]{8,64}$/);
  });

  it('counts entries that were taken but never arrived', () => {
    const batch = createLogBatch(10);
    batch.push({ kind: 'motion' });
    const lost = batch.take();
    batch.lost(lost.entries.length);
    expect(batch.take()).toEqual({ entries: [], dropped: 1 });
  });
});

describe('device log commands', () => {
  const changed = (action: string) => ({
    type: 'FishingChanged' as const,
    minute: 1,
    action,
    entityId: 'run-1',
  });
  const accepted = (
    command: GameCommand,
    events: ReturnType<typeof changed>[],
  ): TraceEntry => ({ sequence: 0, command, result: { ok: true, events } });
  const control: GameCommand = {
    type: 'FISH_CONTROL',
    runId: 'run-1',
    pressed: true,
    ticks: 1,
  };
  const motion: GameCommand = {
    type: 'FISH_MOTION_CONTROL',
    runId: 'run-1',
    x: 50,
    y: 50,
    ticks: 1,
  };

  it('skips a per-tick control that only reported the control change', () => {
    expect(
      commandLogEntry(accepted(control, [changed('control')]), null),
    ).toBeNull();
    expect(
      commandLogEntry(accepted(motion, [changed('control')]), null),
    ).toBeNull();
  });

  it('keeps a per-tick control that changed the phase, by its type only', () => {
    const events = [changed('control'), changed('hooked')];
    expect(commandLogEntry(accepted(motion, events), null)).toEqual({
      command: 'FISH_MOTION_CONTROL',
      ok: true,
      events,
      run: null,
    });
  });

  it('keeps a rejected command with its error', () => {
    expect(
      commandLogEntry(
        {
          sequence: 3,
          command: control,
          result: { ok: false, error: 'FISH_NOT_FOUND' },
        },
        null,
      ),
    ).toEqual({
      command: 'FISH_CONTROL',
      ok: false,
      error: 'FISH_NOT_FOUND',
      run: null,
    });
  });

  it('keeps who was talked to, never what was said', () => {
    const logged = commandLogEntry(
      accepted(
        {
          type: 'INTERACT',
          catId: 'cat-1',
          message: 'secret hello',
          reply: 'secret meow',
        },
        [],
      ),
      null,
    );
    expect(logged?.command).toEqual({ type: 'INTERACT', catId: 'cat-1' });
    expect(JSON.stringify(logged)).not.toContain('secret');
  });
});
