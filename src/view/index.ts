import Phaser from 'phaser';
import type { GameSession } from '../application';
import type { Trace } from '../platform/device-log';
import type { Position } from '../core';
import { CityScene } from './city/scene';
import { MAP_VIEW } from './city/geometry';
import { mountPanel } from './shell/panel';
import { createPlace } from './shell/place';
import './styles/tokens.css';
import './styles/base.css';

/** Frames per second in test builds; production uses the display's rate. */
const TEST_FPS =
  import.meta.env.MODE === 'test' ? { target: 15, limit: 15 } : {};

/** Browser composition; the application owns the session, this layer owns rendering. */
export function mountGameView(session: GameSession, trace: Trace) {
  const place = createPlace();
  const panel = mountPanel(session, place, trace);
  const scene = new CityScene(
    session,
    place,
    panel.notify,
    panel.city,
    panel.aim,
    panel.clockSpeed,
  );
  new Phaser.Game({
    type: Phaser.AUTO,
    render: { antialias: true, roundPixels: false },
    parent: 'game',
    width: MAP_VIEW.size,
    height: MAP_VIEW.size,
    transparent: true,
    banner: false,
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    // Test browsers draw in software; tests need a drawn frame, not smooth motion.
    fps: TEST_FPS,
    scene,
  });
  return {
    tileScreenPosition: (position: Position) =>
      scene.getTileScreenPosition(position),
    fishingClock: panel.fishingClock,
    /** Game minutes per real second chosen at the city clock. */
    clockSpeed: panel.clockSpeed,
  };
}
