import { GameSession } from './application';
import { RuleBasedDialogueProvider } from './providers/rule-dialogue';
import { BrowserSaveRepository, SAVE_KEY } from './platform/storage';
import { STARTER_CAT_ID } from './content/cats';
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
session.select(STARTER_CAT_ID);
// `storage` fires only for writes from other tabs of this origin.
window.addEventListener('storage', (event) => {
  if (event.key === SAVE_KEY) session.externalSaveChanged();
});
const view = mountGameView(session);

if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  void import('./debug/bridge').then(({ installDebugBridge }) =>
    installDebugBridge(session, view),
  );
}

// Browser time is an input adapter: each real second advances the city by the chosen
// speed. Test builds advance game time explicitly.
if (import.meta.env.MODE !== 'test') {
  window.setInterval(() => {
    if (!document.hidden)
      session.execute({ type: 'ADVANCE_TIME', minutes: view.clockSpeed() });
  }, 1000);
}
