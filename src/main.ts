import Phaser from 'phaser';
import { GameSession } from './application/session';
import { BrowserSaveRepository } from './platform/storage';
import { CityScene } from './view/scene';
import { mountPanel } from './view/panel';
import { MAP_VIEW } from './view/geometry';
import './style.css';

const session = new GameSession(new BrowserSaveRepository());
const panel = mountPanel(session);
new Phaser.Game({
  type: Phaser.CANVAS,
  parent: 'game',
  width: MAP_VIEW.size,
  height: MAP_VIEW.size,
  transparent: true,
  banner: false,
  audio: { noAudio: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: new CityScene(session, panel.notify),
});

if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  void import('./debug/bridge').then(({ installDebugBridge }) =>
    installDebugBridge(session),
  );
}

// Browser time is an input adapter. Test builds advance game time explicitly.
if (import.meta.env.MODE !== 'test') {
  window.setInterval(() => {
    if (!document.hidden) session.execute({ type: 'ADVANCE_TIME', minutes: 1 });
  }, 1000);
}
