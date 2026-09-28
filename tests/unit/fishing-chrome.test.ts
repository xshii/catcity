import { describe, expect, it } from 'vitest';
import { fishingChrome } from '../../src/view/fishing/chrome';

const base = {
  place: 'river' as const,
  run: null,
  motionActive: false,
  offersMotion: false,
};
const buttonRun = { mode: 'buttons' as const };
const motionRun = { mode: 'motion' as const };

describe('fishing chrome', () => {
  it('shows nothing of the river anywhere else, whatever the run or sensors', () => {
    for (const run of [null, buttonRun, motionRun])
      for (const motionActive of [false, true])
        for (const offersMotion of [false, true])
          expect(
            fishingChrome({ place: 'city', run, motionActive, offersMotion }),
          ).toEqual({
            readyToCast: false,
            console: false,
            consoleMode: null,
            motionPlay: false,
          });
  });

  it('offers the manual cast only once a phone has chosen, and never with motion on', () => {
    expect(fishingChrome(base).readyToCast).toBe(true);
    expect(fishingChrome({ ...base, offersMotion: true }).readyToCast).toBe(
      false,
    );
    expect(fishingChrome({ ...base, motionActive: true }).readyToCast).toBe(
      false,
    );
  });

  it('shows the run console at the river for the run in progress, in its mode', () => {
    expect(fishingChrome({ ...base, run: buttonRun })).toEqual({
      readyToCast: false,
      console: true,
      consoleMode: 'buttons',
      motionPlay: false,
    });
    expect(fishingChrome({ ...base, run: motionRun })).toMatchObject({
      console: true,
      consoleMode: 'motion',
      motionPlay: true,
    });
  });

  it('gives the river to motion play while motion is on, even between runs', () => {
    expect(fishingChrome({ ...base, motionActive: true })).toMatchObject({
      motionPlay: true,
      console: false,
    });
    // A button run keeps its console even if the phone's motion is on.
    expect(
      fishingChrome({ ...base, run: buttonRun, motionActive: true }),
    ).toMatchObject({ motionPlay: false, consoleMode: 'buttons' });
  });
});
