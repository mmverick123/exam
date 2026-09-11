import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validate } from '@exam/lowcode/contract';
import { runAgent, type AgentResult } from '../src/application/state-machine';
import { resolveBundle } from '../src/contracts/bundles';
import { AnthropicProvider, DeterministicProvider, type AgentProvider, type PlanResult, type ProviderContext } from '../src/providers';
import { assertCase, classifyFailure } from './assertions';
import { fixture } from './fixtures';
import type { CaseRun, EvalCase, EvalReport, FailureMode, StrategyMetrics } from './types';

const mode = process.argv.includes('--full') ? 'full' : 'smoke';
const providerName = process.env.EVAL_PROVIDER === 'anthropic' ? 'anthropic' : 'deterministic';
const samplesPerCase = mode === 'full' ? Math.max(3, Number(process.env.EVAL_SAMPLES ?? 3)) : 1;
const tokenBudget = Number(process.env.EVAL_TOKEN_BUDGET ?? (mode === 'full' ? 750_000 : 20_000));
const root = new URL('./', import.meta.url);
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class SingleStageProvider implements AgentProvider {
  constructor(private readonly delegate: AgentProvider, private readonly comparable: boolean) {}
  intent(context: ProviderContext) { return this.delegate.intent(context); }
  async plan(context: ProviderContext): Promise<PlanResult> {
    if (!this.comparable) return this.delegate.plan(context);
    return { steps: ['单阶段直接生成，注入全部可用组件 schema'], selectedTypes: context.adapter.agentWidgetList().map((widget) => widget.type) };
  }
  generate(context: ProviderContext, plan: PlanResult) { return this.delegate.generate(context, plan); }
  repair(context: ProviderContext, plan: PlanResult, errors: Parameters<AgentProvider['repair']>[2]) { return this.delegate.repair(context, plan, errors); }
  getUsage() { return this.delegate.getUsage?.() ?? { inputTokens: 0, outputTokens: 0 }; }
}

function provider(strategy: 'single-stage' | 'two-stage'): AgentProvider {
  const base = providerName === 'anthropic'
    ? new AnthropicProvider(process.env.EVAL_ANTHROPIC_API_KEY)
    : new DeterministicProvider();
  return strategy === 'single-stage' ? new SingleStageProvider(base, providerName === 'anthropic') : base;
}

async function loadCases(): Promise<{ cases: EvalCase[]; hash: string }> {
  const createText = await readFile(new URL('cases/create.json', root), 'utf8');
  const modifyText = await readFile(new URL('cases/modify.json', root), 'utf8');
  const hash = createHash('sha256').update(createText).update('\n').update(modifyText).digest('hex');
  const expectedHash = (await readFile(new URL('cases/case-set.sha256', root), 'utf8')).trim();
  if (hash !== expectedHash) throw new Error(`Eval 用例集已变更但未显式重新冻结：expected ${expectedHash}, actual ${hash}`);
  return { cases: [...JSON.parse(createText), ...JSON.parse(modifyText)] as EvalCase[], hash };
}

const smokeIds = new Set([
  'create-single-01', 'create-single-05', 'create-multi-01', 'create-multi-04', 'create-group-01',
  'modify-append-01', 'modify-add-option-01', 'modify-reverse-01', 'modify-convert-01', 'modify-repair-01',
]);

function infrastructureFailure(error: unknown): boolean {
  if (error instanceof SyntaxError) return false;
  const value = error as { status?: number; name?: string; code?: string };
  return Boolean(value.status === 429 || (value.status && value.status >= 500) || value.name?.includes('Connection') || value.code?.includes('TIMEOUT'));
}

function estimatedTokens(testCase: EvalCase, initial: ReturnType<typeof fixture>, result?: AgentResult): number {
  const adapter = resolveBundle(initial.contractVersion);
  const selected = result?.plan?.selectedTypes ?? adapter.agentWidgetList().map((widget) => widget.type);
  const prompt = {
    message: testCase.message,
    outline: adapter.outline(initial),
    widgets: adapter.agentWidgetList(),
    schemas: Object.fromEntries(selected.map((type) => [type, adapter.optionsSchema(type)])),
    defaults: Object.fromEntries(selected.map((type) => [type, adapter.defaultOptions(type)])),
  };
  return Math.ceil(JSON.stringify(prompt).length / 4);
}

async function runOne(testCase: EvalCase, strategy: 'single-stage' | 'two-stage', sample: number): Promise<CaseRun> {
  const initial = fixture(testCase.setup);
  const started = Date.now();
  let result: AgentResult | undefined;
  let thrown: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      result = await runAgent({ message: testCase.message, contractVersion: initial.contractVersion, questionOutline: initial }, provider(strategy));
      thrown = undefined;
      break;
    } catch (error) {
      thrown = error;
      if (!infrastructureFailure(error) || attempt === 2) break;
      await sleep(250 * (2 ** attempt));
    }
  }
  if (thrown && infrastructureFailure(thrown)) {
    return { caseId: testCase.id, subset: testCase.subset, sample, strategy, status: 'infra-fail', firstPass: false, finalPass: false, repairCount: 0, elapsedMs: Date.now() - started, inputTokens: 0, outputTokens: 0, estimatedInputTokens: estimatedTokens(testCase, initial), failureModes: [], assertionErrors: [String((thrown as Error).message ?? thrown)] };
  }
  const assertionErrors = result ? assertCase(testCase, initial, result) : [String((thrown as Error)?.message ?? thrown)];
  const legalDelivery = Boolean(result?.json && validate(result.json).errors.length === 0);
  const finalPass = result?.state === 'Deliver' && legalDelivery && assertionErrors.length === 0;
  const status = finalPass ? 'pass' : result?.state === 'Degrade' ? 'safe-degrade' : 'invalid-output';
  return {
    caseId: testCase.id, subset: testCase.subset, sample, strategy, status,
    firstPass: finalPass && result!.repairCount === 0,
    finalPass,
    repairCount: result?.repairCount ?? 0,
    elapsedMs: Date.now() - started,
    inputTokens: result?.usage.inputTokens ?? 0,
    outputTokens: result?.usage.outputTokens ?? 0,
    estimatedInputTokens: estimatedTokens(testCase, initial, result),
    failureModes: classifyFailure(result, assertionErrors, thrown),
    assertionErrors,
  };
}

const failureModes: FailureMode[] = ['hierarchy', 'options-type', 'name-conflict', 'correct-answer-range', 'structured-output', 'structure-mismatch', 'other'];
const round = (value: number) => Number(value.toFixed(2));
function summarize(runs: CaseRun[]): StrategyMetrics {
  const scored = runs.filter((run) => run.status !== 'infra-fail');
  const average = (selector: (run: CaseRun) => number) => scored.length ? scored.reduce((sum, run) => sum + selector(run), 0) / scored.length : 0;
  return {
    runs: runs.length,
    scoredRuns: scored.length,
    infraFailures: runs.length - scored.length,
    firstPassRate: round(scored.length ? scored.filter((run) => run.firstPass).length / scored.length * 100 : 0),
    finalPassRate: round(scored.length ? scored.filter((run) => run.finalPass).length / scored.length * 100 : 0),
    averageRepairCount: round(average((run) => run.repairCount)),
    averageElapsedMs: round(average((run) => run.elapsedMs)),
    averageInputTokens: round(average((run) => run.inputTokens)),
    averageOutputTokens: round(average((run) => run.outputTokens)),
    averageEstimatedInputTokens: round(average((run) => run.estimatedInputTokens)),
    failureModes: Object.fromEntries(failureModes.map((failureMode) => [failureMode, scored.filter((run) => run.failureModes.includes(failureMode)).length])) as Record<FailureMode, number>,
  };
}

async function main(): Promise<void> {
  if (providerName === 'anthropic' && !process.env.EVAL_ANTHROPIC_API_KEY) throw new Error('真实 Eval 必须配置独立的 EVAL_ANTHROPIC_API_KEY');
  const loaded = await loadCases();
  const selectedCases = mode === 'smoke' ? loaded.cases.filter((testCase) => smokeIds.has(testCase.id)) : loaded.cases;
  const strategies: Array<'single-stage' | 'two-stage'> = mode === 'full' ? ['single-stage', 'two-stage'] : ['two-stage'];
  const runs: CaseRun[] = [];
  let consumedBudget = 0;
  for (const strategy of strategies) for (const testCase of selectedCases) for (let sample = 1; sample <= samplesPerCase; sample += 1) {
    const run = await runOne(testCase, strategy, sample);
    consumedBudget += run.inputTokens + run.outputTokens || run.estimatedInputTokens;
    if (consumedBudget > tokenBudget) throw new Error(`Eval token budget exceeded: ${consumedBudget}/${tokenBudget}`);
    runs.push(run);
  }
  const emptyMetrics = summarize([]);
  const strategyMetrics = {
    'single-stage': strategies.includes('single-stage') ? summarize(runs.filter((run) => run.strategy === 'single-stage')) : emptyMetrics,
    'two-stage': summarize(runs.filter((run) => run.strategy === 'two-stage')),
  };
  const infraRatio = runs.filter((run) => run.status === 'infra-fail').length / Math.max(1, runs.length);
  const status = infraRatio > 0.5 ? 'neutral' : runs.some((run) => run.status === 'invalid-output') ? 'fail' : 'pass';
  const hierarchyRate = (metrics: StrategyMetrics) => metrics.scoredRuns ? metrics.failureModes.hierarchy / metrics.scoredRuns * 100 : 0;
  const hasStrategyComparison = strategies.includes('single-stage');
  const comparable = providerName === 'anthropic' && mode === 'full';
  const report: EvalReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    caseSetHash: loaded.hash,
    provider: providerName,
    comparableModelExperiment: comparable,
    mode,
    samplesPerCase,
    tokenBudget,
    status,
    strategies: strategyMetrics,
    comparison: {
      firstPassRateDelta: hasStrategyComparison ? round(strategyMetrics['two-stage'].firstPassRate - strategyMetrics['single-stage'].firstPassRate) : 0,
      finalPassRateDelta: hasStrategyComparison ? round(strategyMetrics['two-stage'].finalPassRate - strategyMetrics['single-stage'].finalPassRate) : 0,
      hierarchyFailureRateDelta: hasStrategyComparison ? round(hierarchyRate(strategyMetrics['single-stage']) - hierarchyRate(strategyMetrics['two-stage'])) : 0,
      note: comparable
        ? '同一真实模型下单阶段与两阶段的多次采样对比。'
        : mode === 'smoke'
          ? 'Smoke 只执行两阶段安全回归，不提供策略对比。'
          : '离线确定性回归基线；不得表述为真实 LLM 质量提升。',
    },
    runs,
  };
  const metricsDirectory = new URL('metrics/', root);
  await mkdir(metricsDirectory, { recursive: true });
  const runTimestamp = report.generatedAt.replace(/[:.]/g, '-');
  const output = path.join(fileURLToPath(metricsDirectory), `${runTimestamp}-${mode}-${providerName}.json`);
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ status, provider: providerName, mode, caseCount: selectedCases.length, samplesPerCase, strategies: strategyMetrics, comparison: report.comparison, output }, null, 2)}\n`);
  if (status === 'fail') process.exitCode = 1;
  if (status === 'neutral') process.exitCode = 2;
}

void main();
