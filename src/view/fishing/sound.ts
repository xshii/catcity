import type { GameSession } from '../../application';
import { readPref, savePref } from '../../platform/local-prefs';
import {
  reelLevel,
  SOUND_KEY,
  soundCues,
  soundLabel,
  soundOn,
  type SoundCue,
} from './sound-cues';
import type { FishingViewStore } from './view-state';

/** Master volume: every sound stays soft under other audio. */
const VOLUME = 0.35;
/** Seconds from the cast's whoosh to the float landing on the water. */
const LANDING_S = 0.45;
/** Every change a gesture could unlock audio from; browsers differ on which counts. */
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown'];

interface AudioSessionApi {
  audioSession?: { type: string };
}

/**
 * Optional fishing sound effects (spec 033 F4), synthesised with Web Audio: no files.
 * The audio context starts at the first user gesture, as browsers require; without Web
 * Audio everything is silent. Like haptics, sound never feeds anything back into Core.
 */
export function mountFishingSound(
  session: GameSession,
  view: FishingViewStore,
  button: HTMLButtonElement,
) {
  const supported = typeof window.AudioContext === 'function';
  let enabled = supported && soundOn(readPref(SOUND_KEY));
  let synth: ReturnType<typeof createSynth> | null = null;
  const reel = () =>
    synth?.reel(
      enabled
        ? reelLevel(view.get(), session.getSnapshot().fishing.active)
        : null,
    );
  const start = () => {
    if (!enabled) return;
    if (!synth) {
      // iOS: ambient audio follows the silent switch and mixes with other audio.
      const audio = navigator as Navigator & AudioSessionApi;
      if (audio.audioSession) audio.audioSession.type = 'ambient';
      synth = createSynth(new AudioContext());
    }
    synth.resume();
  };
  for (const type of GESTURES)
    window.addEventListener(type, start, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) synth?.suspend();
    else if (enabled) synth?.resume();
  });
  const draw = () => {
    button.disabled = !supported;
    button.textContent = soundLabel(supported, enabled);
    button.setAttribute('aria-pressed', String(enabled));
  };
  button.addEventListener('click', () => {
    enabled = !enabled;
    savePref(SOUND_KEY, enabled ? 'on' : 'off');
    start();
    reel();
    draw();
  });
  let previous = session.getSnapshot().fishing;
  session.subscribe(() => {
    const next = session.getSnapshot().fishing;
    const cues = soundCues(previous, next);
    previous = next;
    if (enabled && !document.hidden) for (const cue of cues) synth?.play(cue);
    reel();
  });
  view.subscribe(reel);
  draw();
}

/** Soft voices: sine and triangle tones, filtered noise and gentle envelopes. */
function createSynth(context: AudioContext) {
  const master = context.createGain();
  master.gain.value = VOLUME;
  // A low-pass over everything keeps even the snap round.
  const soften = context.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 4000;
  master.connect(soften).connect(context.destination);
  const noiseBuffer = context.createBuffer(
    1,
    context.sampleRate,
    context.sampleRate,
  );
  const samples = noiseBuffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

  /** A gain that rises to `peak` over `attack`, then fades out by `length`. */
  const envelope = (
    at: number,
    peak: number,
    length: number,
    attack = 0.01,
  ) => {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    gain.connect(master);
    return gain;
  };
  const tone = (
    at: number,
    length: number,
    peak: number,
    from: number,
    to = from,
    type: OscillatorType = 'sine',
  ) => {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(to, at + length);
    oscillator.connect(envelope(at, peak, length));
    oscillator.start(at);
    oscillator.stop(at + length + 0.05);
  };
  const noise = (
    at: number,
    length: number,
    peak: number,
    filter: BiquadFilterType,
    from: number,
    to = from,
    attack = 0.01,
  ) => {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const shape = context.createBiquadFilter();
    shape.type = filter;
    shape.frequency.setValueAtTime(from, at);
    shape.frequency.exponentialRampToValueAtTime(to, at + length);
    source.connect(shape).connect(envelope(at, peak, length, attack));
    source.start(at);
    source.stop(at + length + 0.05);
  };
  const splash = (at: number, size: number) => {
    noise(at, 0.35 * size, 0.22 * size, 'lowpass', 1800, 300);
    tone(at, 0.12, 0.12, 280, 90);
  };
  const voices: Record<SoundCue, (at: number) => void> = {
    // A rising whoosh of air, then the float lands.
    cast: (at) => {
      noise(at, 0.35, 0.16, 'bandpass', 400, 1600, 0.14);
      splash(at + LANDING_S, 1);
    },
    // The float ticks twice.
    nibble: (at) => {
      tone(at, 0.05, 0.05, 1300, 1100, 'triangle');
      tone(at + 0.09, 0.05, 0.04, 1250, 1050, 'triangle');
    },
    // A round "plop" as the float goes under.
    bite: (at) => {
      tone(at, 0.16, 0.2, 380, 110);
      noise(at, 0.12, 0.07, 'lowpass', 900, 200);
    },
    // The line sings: two close tones beat against each other.
    strain: (at) => {
      tone(at, 0.35, 0.035, 620, 700, 'triangle');
      tone(at, 0.35, 0.035, 628, 708, 'triangle');
    },
    // The fish comes out of the water, then a small chime.
    catch: (at) => {
      splash(at, 1.4);
      [784, 988, 1175].forEach((pitch, index) => {
        tone(at + 0.15 + index * 0.12, 0.9, 0.06, pitch);
        tone(at + 0.15 + index * 0.12, 0.6, 0.015, pitch * 2);
      });
    },
    // A short snap and the slack line springing back.
    snap: (at) => {
      noise(at, 0.06, 0.1, 'highpass', 2500, 2500, 0.002);
      tone(at, 0.22, 0.07, 520, 140, 'triangle');
    },
  };

  /** The reel's hum: a low tone with a soft ripple, both rising as the fish comes in. */
  let hum: {
    pitch: OscillatorNode;
    ripple: OscillatorNode;
    gain: GainNode;
  } | null = null;
  const reel = (level: number | null) => {
    const now = context.currentTime;
    if (level === null) {
      if (!hum) return;
      hum.gain.gain.setTargetAtTime(0, now, 0.05);
      hum.pitch.stop(now + 0.3);
      hum.ripple.stop(now + 0.3);
      hum = null;
      return;
    }
    if (!hum) {
      const pitch = context.createOscillator();
      pitch.type = 'triangle';
      const ripple = context.createOscillator();
      const depth = context.createGain();
      depth.gain.value = 0.3;
      const tremolo = context.createGain();
      const gain = context.createGain();
      gain.gain.value = 0;
      ripple.connect(depth).connect(tremolo.gain);
      pitch.connect(tremolo).connect(gain).connect(master);
      pitch.start(now);
      ripple.start(now);
      hum = { pitch, ripple, gain };
    }
    hum.pitch.frequency.setTargetAtTime(150 + level * 150, now, 0.1);
    hum.ripple.frequency.setTargetAtTime(6 + level * 6, now, 0.1);
    hum.gain.gain.setTargetAtTime(0.025 + level * 0.035, now, 0.08);
  };

  return {
    play: (cue: SoundCue) => voices[cue](context.currentTime),
    reel,
    resume: () => {
      if (context.state !== 'running') void context.resume().catch(() => {});
    },
    suspend: () => void context.suspend().catch(() => {}),
  };
}
