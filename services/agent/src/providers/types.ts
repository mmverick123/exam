import type { QuestionJson, QuestionPatch, ValidationIssue } from '@exam/lowcode/contract';

import type { ContractAdapter } from '../contracts/bundles';

export type IntentKind = 'create' | 'modify' | 'irrelevant';
export interface IntentResult { kind: IntentKind; targetIds?: string[]; }
export interface AgentNodeRef { id: string; type: string; label: string; path: string; parentId?: string; }
export interface PlanGroup { id: string; title: string; risk: 'low' | 'medium' | 'high'; dependsOn: string[]; }
export interface PlanResult {
  steps: string[];
  selectedTypes: string[];
  targetIds?: string[];
  parentIds?: string[];
  excludedIds?: string[];
  assumptions?: string[];
  acceptanceCriteria?: string[];
  groups?: PlanGroup[];
  risk?: 'low' | 'medium' | 'high';
  requiresClarification?: boolean;
  clarificationQuestion?: string;
}
export interface ConversationTurn { role: 'user' | 'assistant'; content: string; }
export interface ProviderContext { adapter: ContractAdapter; outline: QuestionJson; message: string; history?: ConversationTurn[]; signal?: AbortSignal; nodeRefs?: AgentNodeRef[]; }
export interface ProviderUsage { inputTokens: number; outputTokens: number; }

export interface AgentProvider {
  intent(context: ProviderContext): Promise<IntentResult>;
  plan(context: ProviderContext): Promise<PlanResult>;
  generate(context: ProviderContext, plan: PlanResult): Promise<QuestionPatch>;
  repair(context: ProviderContext, plan: PlanResult, errors: ValidationIssue[]): Promise<QuestionPatch | null>;
  getUsage?(): ProviderUsage;
}
