import Anthropic from '@anthropic-ai/sdk';

import type { QuestionPatch, ValidationIssue } from '@exam/lowcode/contract';
import { buildEmitPatchToolSchema } from '../contracts/tool-schema';
import { hasContent } from './shared';
import type { AgentProvider, IntentResult, PlanResult, ProviderContext, ProviderUsage } from './types';

/** Accept JSON wrapped in Markdown fences or surrounded by brief prose. */
export function parseModelJson<T>(text: string, label: string): T {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const candidates = [normalized];
  const firstObject = normalized.indexOf('{');
  const lastObject = normalized.lastIndexOf('}');
  if (firstObject >= 0 && lastObject > firstObject) candidates.push(normalized.slice(firstObject, lastObject + 1));
  for (const candidate of candidates) {
    try { return JSON.parse(candidate) as T; } catch { /* try the next normalized candidate */ }
  }
  throw new Error(`${label} 返回的内容不是有效 JSON`);
}

export function normalizePlanResult(value: Partial<PlanResult>, context: ProviderContext): PlanResult {
  const availableTypes = new Set(context.adapter.agentWidgetList().map((widget) => widget.type));
  const selectedTypes = Array.isArray(value.selectedTypes)
    ? value.selectedTypes.filter((type): type is string => typeof type === 'string' && availableTypes.has(type))
    : [];
  return {
    steps: Array.isArray(value.steps) ? value.steps.filter((step): step is string => typeof step === 'string') : [],
    selectedTypes: selectedTypes.length > 0 ? selectedTypes : ['stem', 'single-choice'],
  };
}

export class AnthropicProvider implements AgentProvider {
  private readonly client: Anthropic;
  private readonly usage: ProviderUsage = { inputTokens: 0, outputTokens: 0 };

  constructor(
    apiKey = process.env.ANTHROPIC_API_KEY,
    private readonly intentModel = process.env.AGENT_INTENT_MODEL ?? 'claude-haiku-4-5',
    private readonly generationModel = process.env.AGENT_MODEL ?? 'claude-sonnet-5',
    baseURL = process.env.ANTHROPIC_BASE_URL,
  ) {
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY 未配置');
    this.client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  async intent(context: ProviderContext): Promise<IntentResult> {
    const response = await this.client.messages.create({
      model: this.intentModel,
      max_tokens: 256,
      system: '判定用户请求属于 create、modify 或 irrelevant，只返回 JSON。',
      messages: [{ role: 'user', content: JSON.stringify({ history: context.history, message: context.message, hasContent: hasContent(context.outline) }) }],
    }, { signal: context.signal });
    this.recordUsage(response.usage);
    const text = response.content.find((block) => block.type === 'text');
    const parsed = parseModelJson<IntentResult>(text?.type === 'text' ? text.text : '{}', 'intent');
    return hasContent(context.outline) && parsed.kind === 'create' ? { ...parsed, kind: 'modify' } : parsed;
  }

  async plan(context: ProviderContext): Promise<PlanResult> {
    const response = await this.client.messages.create({
      model: this.generationModel,
      max_tokens: 512,
      system: '根据组件清单规划题型结构，只输出 JSON。',
      messages: [{ role: 'user', content: JSON.stringify({ history: context.history, message: context.message, widgets: context.adapter.agentWidgetList(), outline: context.adapter.outline(context.outline) }) }],
    }, { signal: context.signal });
    this.recordUsage(response.usage);
    const text = response.content.find((block) => block.type === 'text');
    const parsed = parseModelJson<Partial<PlanResult>>(text?.type === 'text' ? text.text : '{}', 'plan');
    return normalizePlanResult(parsed, context);
  }

  async generate(context: ProviderContext, plan: PlanResult): Promise<QuestionPatch> {
    const toolSchema = buildEmitPatchToolSchema(context.adapter, plan.selectedTypes);
    const response = await this.client.messages.create({
      model: this.generationModel,
      max_tokens: 4096,
      system: '生成题型补丁。必须调用 emit_patch 工具，不得输出全量 JSON。',
      messages: [{ role: 'user', content: JSON.stringify({ message: context.message, outline: context.adapter.outline(context.outline), defaults: Object.fromEntries(plan.selectedTypes.map((type) => [type, context.adapter.defaultOptions(type)])) }) }],
      tools: [{ name: 'emit_patch', description: '输出 QuestionPatch', input_schema: toolSchema as unknown as { type: 'object'; [key: string]: unknown } }],
      tool_choice: { type: 'tool', name: 'emit_patch' },
    }, { signal: context.signal });
    this.recordUsage(response.usage);
    const block = response.content.find((item) => item.type === 'tool_use');
    if (!block || block.type !== 'tool_use') throw new Error('模型未返回 emit_patch tool_use');
    return block.input as QuestionPatch;
  }

  async repair(context: ProviderContext, plan: PlanResult, errors: ValidationIssue[]): Promise<QuestionPatch | null> {
    return this.generate({ ...context, message: `${context.message}\n请修复以下错误：${JSON.stringify(errors)}` }, plan);
  }

  getUsage(): ProviderUsage { return { ...this.usage }; }

  private recordUsage(usage: { input_tokens: number; output_tokens: number }): void {
    this.usage.inputTokens += usage.input_tokens;
    this.usage.outputTokens += usage.output_tokens;
  }
}
