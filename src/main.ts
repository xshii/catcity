import { GameSession } from './application';
import { RuleBasedDialogueProvider } from './providers/rule-dialogue';
import { BrowserSaveRepository, SAVE_KEY } from './platform/storage';
import { STARTER_CAT_ID } from './content/cats';
import { mountGameView } from './view';
import { commandLogEntry, startDeviceLog } from './platform/device-log';

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
/** Debugging must never stop the game: a log that fails to start stays off. */
function deviceLog() {
  try {
    return startDeviceLog(__BUILD_VERSION__);
  } catch {
    return null;
  }
}
const trace = deviceLog();
if (trace) {
  // Each command is logged once, however often the session notifies.
  let logged = -1;
  session.subscribe(() => {
    const entry = session.lastCommand();
    // A reset or checkpoint empties the record; its next command is sequence 0 again.
    if (!entry) logged = -1;
    if (!entry || entry.sequence === logged) return;
    logged = entry.sequence;
    const data = commandLogEntry(entry, session.getSnapshot().fishing.active);
    if (data) trace('command', data);
  });
}
const view = mountGameView(session, trace ?? (() => {}));

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
