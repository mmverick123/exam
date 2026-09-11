import type { QuestionJson } from '@exam/lowcode/contract';

export type EvalSubset = 'create' | 'modify';
export type EvalSetup = 'empty' | 'oneChoice' | 'twoChoices' | 'group';
export interface EvalExpectation {
  answerTypes?: Record<string, number>;
  optionCount?: number;
  targetIndex?: number;
  groupCount?: number;
  groupChildCount?: number;
  nodeDelta?: number;
  preserveUnmentioned?: boolean;
  preserveValues?: boolean;
  reverseValues?: boolean;
  movedToEnd?: string;
  movedToStart?: string;
  requiresRepair?: boolean;
}
export interface EvalCase { id: string; subset: EvalSubset; message: string; setup: EvalSetup; expect: EvalExpectation; }
export type FailureMode = 'hierarchy' | 'options-type' | 'name-conflict' | 'correct-answer-range' | 'structured-output' | 'structure-mismatch' | 'other';
export interface CaseRun {
  caseId: string;
  subset: EvalSubset;
  sample: number;
  strategy: 'single-stage' | 'two-stage';
  status: 'pass' | 'invalid-output' | 'infra-fail' | 'safe-degrade';
  firstPass: boolean;
  finalPass: boolean;
  repairCount: number;
  elapsedMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedInputTokens: number;
  failureModes: FailureMode[];
  assertionErrors: string[];
}
export interface StrategyMetrics {
  runs: number;
  scoredRuns: number;
  infraFailures: number;
  firstPassRate: number;
  finalPassRate: number;
  averageRepairCount: number;
  averageElapsedMs: number;
  averageInputTokens: number;
  averageOutputTokens: number;
  averageEstimatedInputTokens: number;
  failureModes: Record<FailureMode, number>;
}
export interface EvalReport {
  schemaVersion: 1;
  generatedAt: string;
  caseSetHash: string;
  provider: 'deterministic' | 'anthropic';
  comparableModelExperiment: boolean;
  mode: 'smoke' | 'full';
  samplesPerCase: number;
  tokenBudget: number;
  status: 'pass' | 'fail' | 'neutral';
  strategies: Record<'single-stage' | 'two-stage', StrategyMetrics>;
  comparison: { firstPassRateDelta: number; finalPassRateDelta: number; hierarchyFailureRateDelta: number; note: string };
  runs: CaseRun[];
}

export interface EvalFixture { initial: QuestionJson; }
