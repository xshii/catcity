/** Application entry and ports; concrete browser/provider adapters are injected. */
export { GameSession } from './session';
export type { GameSessionOptions, ReplayRecord, TraceEntry } from './session';
export type {
  SaveRepository,
  DialogueContext,
  DialogueProvider,
  DialogueProposal,
} from './ports';
