import Phaser from 'phaser';
import type { GameSession } from '../application';
import type { Position } from '../core';
import { CityScene } from './city/scene';
import { MAP_VIEW } from './city/geometry';
import { mountPanel } from './shell/panel';
import './styles/base.css';

/** Browser composition; the application owns the session, this layer owns rendering. */
export function mountGameView(session: GameSession) {
  const panel = mountPanel(session);
  const scene = new CityScene(session, panel.notify, panel.cityActions);
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
    scene,
  });
  return {
    tileScreenPosition: (position: Position) =>
      scene.getTileScreenPosition(position),
  };
}
