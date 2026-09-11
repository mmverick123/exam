import {
  applyQuestionPatch,
  normalizeJson,
  validate,
  type QuestionJson,
  type QuestionPatch,
  type ValidationIssue,
} from '@exam/lowcode/contract';

import { buildContractBundles, resolveBundle, type ContractAdapter } from '../contracts/bundles';
import { defaultProvider, type AgentProvider, type ConversationTurn, type IntentResult, type PlanResult, type ProviderUsage } from '../providers';

export type AgentState = 'Intent' | 'Plan' | 'Generate' | 'Validate' | 'Repair' | 'Degrade' | 'Deliver' | 'Reject';
export interface AgentRequest { sessionId?: string; message: string; contractVersion: string; questionOutline: QuestionJson; signal?: AbortSignal; history?: ConversationTurn[]; onEvent?: (event: AgentEvent) => void; }
export interface AgentEvent { event: 'plan' | 'message' | 'patch' | 'validation' | 'done' | 'error'; data: Record<string, unknown>; }
export interface AgentResult {
  state: 'Deliver' | 'Degrade' | 'Reject';
  patch?: QuestionPatch;
  json?: QuestionJson;
  intent?: IntentResult;
  plan?: PlanResult;
  errors?: ValidationIssue[];
  warnings?: ValidationIssue[];
  repairCount: number;
  events: AgentEvent[];
  usage: ProviderUsage;
}

const providerUsage = (provider: AgentProvider): ProviderUsage => provider.getUsage?.() ?? { inputTokens: 0, outputTokens: 0 };

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Agent request aborted', 'AbortError');
}

function emit(events: AgentEvent[], event: AgentEvent['event'], data: Record<string, unknown>, callback?: AgentRequest['onEvent']): void {
  const item = { event, data } as AgentEvent;
  events.push(item);
  callback?.(item);
}

export async function runAgent(
  request: AgentRequest,
  provider: AgentProvider = defaultProvider(),
): Promise<AgentResult> {
  const events: AgentEvent[] = [];
  const startedAt = Date.now();
  const adapter: ContractAdapter = resolveBundle(request.contractVersion, buildContractBundles());
  const outline = normalizeJson(request.questionOutline);
  if (JSON.stringify(outline).length > 256 * 1024) throw new Error('QUESTION_OUTLINE_TOO_LARGE');
  const outlineResult = validate(outline);
  if (outlineResult.errors.length > 0) {
    emit(events, 'error', { code: 'INVALID_OUTLINE', message: '当前题型 outline 不合法' }, request.onEvent);
    return { state: 'Reject', errors: outlineResult.errors, warnings: outlineResult.warnings, repairCount: 0, events, usage: providerUsage(provider) };
  }
  const baselineBlocking = new Map<string, number>();
  for (const issue of outlineResult.warnings.filter((item) => item.severity === 'warn-block')) {
    const key = `${issue.code}\u0000${issue.message}`;
    baselineBlocking.set(key, (baselineBlocking.get(key) ?? 0) + 1);
  }

  assertNotAborted(request.signal);
  const context = { adapter, outline, message: request.message, history: request.history, signal: request.signal };
  const intent = await provider.intent(context);
  assertNotAborted(request.signal);
  if (intent.kind === 'irrelevant') {
    emit(events, 'error', { code: 'IRRELEVANT_REQUEST', message: '请求与题型编排无关' }, request.onEvent);
    return { state: 'Reject', intent, repairCount: 0, events, usage: providerUsage(provider) };
  }

  const plan = await provider.plan(context);
  assertNotAborted(request.signal);
  emit(events, 'plan', { steps: plan.steps }, request.onEvent);
  let patch = await provider.generate(context, plan);
  let repairCount = 0;
  let lastErrors: ValidationIssue[] = [];

  for (;;) {
    assertNotAborted(request.signal);
    try {
      const applied = applyQuestionPatch(outline, patch);
      const validation = validate(applied.json);
      const seenBlocking = new Map<string, number>();
      const newBlockingWarnings = validation.warnings.filter((issue) => {
        if (issue.severity !== 'warn-block') return false;
        const key = `${issue.code}\u0000${issue.message}`;
        const count = (seenBlocking.get(key) ?? 0) + 1;
        seenBlocking.set(key, count);
        return count > (baselineBlocking.get(key) ?? 0);
      });
      const blockingIssues = [...validation.errors, ...newBlockingWarnings];
      if (blockingIssues.length === 0) {
        emit(events, 'patch', { ops: patch.ops, summary: patch.summary }, request.onEvent);
        emit(events, 'validation', { valid: true, warnings: validation.warnings }, request.onEvent);
        const usage = providerUsage(provider);
        emit(events, 'done', { tokens: usage.inputTokens + usage.outputTokens, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, elapsed: Date.now() - startedAt, repairCount }, request.onEvent);
        return { state: 'Deliver', patch, json: applied.json, intent, plan, warnings: validation.warnings, repairCount, events, usage };
      }
      lastErrors = blockingIssues;
      emit(events, 'validation', { valid: false, errors: blockingIssues, repairCount }, request.onEvent);
    } catch (error) {
      lastErrors = [{ code: 'PATCH_INVALID', path: '', message: error instanceof Error ? error.message : String(error), severity: 'error' }];
      emit(events, 'validation', { valid: false, errors: lastErrors, repairCount }, request.onEvent);
    }

    if (repairCount >= 3) {
      emit(events, 'error', { code: 'REPAIR_LIMIT_EXCEEDED', message: '修复次数已达上限，未返回非法 JSON' }, request.onEvent);
      emit(events, 'done', { tokens: 0, elapsed: Date.now() - startedAt, repairCount }, request.onEvent);
      return { state: 'Degrade', patch, intent, plan, errors: lastErrors, repairCount, events, usage: providerUsage(provider) };
    }
    repairCount += 1;
    assertNotAborted(request.signal);
    const repaired = await provider.repair(context, plan, lastErrors);
    assertNotAborted(request.signal);
    if (!repaired) {
      emit(events, 'error', { code: 'REPAIR_UNAVAILABLE', message: 'Provider 无法修复当前结果' }, request.onEvent);
      return { state: 'Degrade', intent, plan, errors: lastErrors, repairCount, events, usage: providerUsage(provider) };
    }
    patch = repaired;
  }
}
