import { GameSession } from './application';
import { RuleBasedDialogueProvider } from './providers/rule-dialogue';
import { BrowserSaveRepository } from './platform/storage';
import { mountGameView } from './view';

const initialSeed =
  import.meta.env.MODE === 'test'
    ? 42
    : crypto.getRandomValues(new Uint32Array(1))[0]!;
const dialogue = new RuleBasedDialogueProvider();
const session = new GameSession({
  repository: new BrowserSaveRepository(),
  dialogue,
  fallbackDialogue: dialogue,
  seed: initialSeed,
});
session.select('mochi');
const view = mountGameView(session);

if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  void import('./debug/bridge').then(({ installDebugBridge }) =>
    installDebugBridge(session, view),
  );
}

// Browser time is an input adapter. Test builds advance game time explicitly.
if (import.meta.env.MODE !== 'test') {
  window.setInterval(() => {
    if (!document.hidden) session.execute({ type: 'ADVANCE_TIME', minutes: 1 });
  }, 1000);
}
