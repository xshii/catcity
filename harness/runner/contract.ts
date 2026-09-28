import type { Page } from '@playwright/test';

export interface HarnessTask {
  id: string;
  goal: string;
  acceptanceCriteria: string[];
  commands: {
    name: string;
    executable: string;
    args: string[];
    timeoutMs?: number;
  }[];
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
