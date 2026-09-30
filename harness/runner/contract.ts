import type { Page } from '@playwright/test';

export interface HarnessCommand {
  name: string;
  executable: string;
  args: string[];
  timeoutMs?: number;
}

/**
 * The browser test files a run takes: every one, or only these (an empty list for none).
 * `notes` say how they were chosen; the runner writes them at the top of checks.log.
 */
export interface BrowserTestChoice {
  files: 'all' | readonly string[];
  notes: readonly string[];
}

export interface HarnessTask {
  id: string;
  goal: string;
  acceptanceCriteria: string[];
  /** Checks that run first, whichever browser tests follow. */
  commands: HarnessCommand[];
  /** Runs the chosen browser test files; with none, still prepares what `launch` serves. */
  browserTests: (files: BrowserTestChoice['files']) => HarnessCommand[];
  expectedState: Record<string, unknown>;
  visualEvidence: string[];
  regressionTests: string[];
  launch: { executable: string; args: string[]; url: string };
}
export type AcceptanceStep = (
  name: string,
  action: () => Promise<void>,
) => Promise<void>;
export interface GameAdapter {
  exercise(page: Page, step: AcceptanceStep): Promise<void>;
  collect(page: Page): Promise<Record<string, unknown>>;
  verifyReplay(evidence: Record<string, unknown>): void;
}
