import type { QuestionJson, QuestionPatch, ValidationIssue } from '@exam/lowcode/contract';

import type { ContractAdapter } from '../contracts/bundles';

export type IntentKind = 'create' | 'modify' | 'irrelevant';
export interface IntentResult { kind: IntentKind; targetIds?: string[]; }
export interface PlanResult { steps: string[]; selectedTypes: string[]; }
export interface ConversationTurn { role: 'user' | 'assistant'; content: string; }
export interface ProviderContext { adapter: ContractAdapter; outline: QuestionJson; message: string; history?: ConversationTurn[]; signal?: AbortSignal; }
export interface ProviderUsage { inputTokens: number; outputTokens: number; }

export interface AgentProvider {
  intent(context: ProviderContext): Promise<IntentResult>;
  plan(context: ProviderContext): Promise<PlanResult>;
  generate(context: ProviderContext, plan: PlanResult): Promise<QuestionPatch>;
  repair(context: ProviderContext, plan: PlanResult, errors: ValidationIssue[]): Promise<QuestionPatch | null>;
  getUsage?(): ProviderUsage;
}
