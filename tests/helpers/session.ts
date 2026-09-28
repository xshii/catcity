import {
  GameSession,
  type GameSessionOptions,
  type SaveRepository,
} from '../../src/application';
import { RuleBasedDialogueProvider } from '../../src/providers/rule-dialogue';

export function memoryRepository(): SaveRepository {
  let save: string | null = null;
  return {
    read: () => save,
    write: (value) => {
      save = value;
    },
  };
}

/** Test-only composition root. Production always supplies every session dependency. */
export function createTestSession(
  options: Partial<GameSessionOptions> = {},
): GameSession {
  const rule = new RuleBasedDialogueProvider();
  return new GameSession({
    repository: options.repository ?? memoryRepository(),
    dialogue: options.dialogue ?? rule,
    fallbackDialogue: options.fallbackDialogue ?? rule,
    seed: options.seed ?? 42,
  });
}
