import Anthropic from '@anthropic-ai/sdk';

import type { QuestionPatch, ValidationIssue } from '@exam/lowcode/contract';
import { buildEmitPatchToolSchema } from '../contracts/tool-schema';
import { buildNodeRefs } from '../contracts/node-refs';
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
  const refs = context.nodeRefs ?? buildNodeRefs(context.outline);
  const validIds = new Set(refs.map((ref) => ref.id));
  const containerIds = new Set(refs.filter((ref) => context.adapter.isContainer(ref.type)).map((ref) => ref.id));
  const selectedTypes = Array.isArray(value.selectedTypes)
    ? value.selectedTypes.filter((type): type is string => typeof type === 'string' && availableTypes.has(type))
    : [];
  const targetIds = Array.isArray(value.targetIds) ? [...new Set(value.targetIds.filter((id): id is string => typeof id === 'string' && validIds.has(id)))] : [];
  const parentIds = Array.isArray(value.parentIds) ? [...new Set(value.parentIds.filter((id): id is string => typeof id === 'string' && containerIds.has(id)))] : [];
  const excludedIds = Array.isArray(value.excludedIds) ? [...new Set(value.excludedIds.filter((id): id is string => typeof id === 'string' && validIds.has(id)))] : [];
  const requiresClarification = value.requiresClarification === true;
  return {
    steps: Array.isArray(value.steps) ? value.steps.filter((step): step is string => typeof step === 'string') : [],
    selectedTypes: selectedTypes.length > 0 ? selectedTypes : ['stem', 'single-choice'],
    targetIds,
    parentIds,
    excludedIds,
    assumptions: Array.isArray(value.assumptions) ? value.assumptions.filter((item): item is string => typeof item === 'string') : [],
    acceptanceCriteria: Array.isArray(value.acceptanceCriteria) ? value.acceptanceCriteria.filter((item): item is string => typeof item === 'string') : [],
    groups: Array.isArray(value.groups) ? value.groups.filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string' && ['low', 'medium', 'high'].includes(item.risk)) : [],
    risk: value.risk === 'high' || value.risk === 'medium' ? value.risk : 'low',
    requiresClarification,
    ...(requiresClarification && typeof value.clarificationQuestion === 'string' ? { clarificationQuestion: value.clarificationQuestion } : {}),
  };
}

export function fallbackPlanResult(context: ProviderContext): PlanResult {
  const refs = context.nodeRefs ?? buildNodeRefs(context.outline);
  const widgets = context.adapter.agentWidgetList();
  const selectedTypes = widgets.filter((widget) => context.message.includes(widget.displayName) || context.message.includes(widget.type)).map((widget) => widget.type);
  const page = refs.find((ref) => ref.type === 'page');
  return normalizePlanResult({
    steps: ['根据用户描述生成并定位组件'],
    selectedTypes: selectedTypes.length ? selectedTypes : ['stem', 'single-choice'],
    targetIds: page ? [page.id] : [],
    parentIds: page ? [page.id] : [],
    risk: /删除|移除|答案|正确选项|移动/.test(context.message) ? 'high' : 'low',
  }, context);
}

export function extractToolInput<T>(content: readonly { type: string; name?: string; input?: unknown }[], toolName: string): T | undefined {
  const block = content.find((item) => item.type === 'tool_use' && item.name === toolName);
  return block?.input as T | undefined;
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
    const widgets = context.adapter.agentWidgetList();
    const refs = context.nodeRefs ?? buildNodeRefs(context.outline);
    const idEnum = refs.map((ref) => ref.id);
    const containerIdEnum = refs.filter((ref) => context.adapter.isContainer(ref.type)).map((ref) => ref.id);
    const response = await this.client.messages.create({
      model: this.generationModel,
      max_tokens: 1024,
      system: '先明确用户真正要修改的目标组件和允许新增的父容器。不要把“可用组件”误当成“目标组件”。若指代存在歧义，设置 requiresClarification 并提出一个简短问题。高风险删除、移动或答案修改标记 high。必须调用 emit_plan。',
      messages: [{ role: 'user', content: JSON.stringify({ history: context.history, message: context.message, widgets, nodes: refs, outline: context.adapter.outline(context.outline) }) }],
      tools: [{
        name: 'emit_plan',
        description: '输出带目标范围、风险和验收条件的题型变更计划',
        input_schema: {
          type: 'object',
          properties: {
            steps: { type: 'array', items: { type: 'string' } },
            selectedTypes: { type: 'array', items: { type: 'string', enum: widgets.map((widget) => widget.type) } },
            targetIds: { type: 'array', items: { type: 'string', enum: idEnum } },
            parentIds: { type: 'array', items: { type: 'string', enum: containerIdEnum } },
            excludedIds: { type: 'array', items: { type: 'string', enum: idEnum } },
            assumptions: { type: 'array', items: { type: 'string' } },
            acceptanceCriteria: { type: 'array', items: { type: 'string' } },
            risk: { type: 'string', enum: ['low', 'medium', 'high'] },
            requiresClarification: { type: 'boolean' },
            clarificationQuestion: { type: 'string' },
          },
          required: ['steps', 'selectedTypes', 'targetIds', 'parentIds', 'excludedIds', 'assumptions', 'acceptanceCriteria', 'risk', 'requiresClarification'],
          additionalProperties: false,
        },
      }],
      tool_choice: { type: 'tool', name: 'emit_plan' },
    }, { signal: context.signal });
    this.recordUsage(response.usage);
    const toolInput = extractToolInput<Partial<PlanResult>>(response.content, 'emit_plan');
    if (toolInput) return normalizePlanResult(toolInput, { ...context, nodeRefs: refs });
    const text = response.content.find((block) => block.type === 'text');
    try { return normalizePlanResult(parseModelJson<Partial<PlanResult>>(text?.type === 'text' ? text.text : '', 'plan'), { ...context, nodeRefs: refs }); }
    catch { return fallbackPlanResult({ ...context, nodeRefs: refs }); }
  }

  async generate(context: ProviderContext, plan: PlanResult): Promise<QuestionPatch> {
    const toolSchema = buildEmitPatchToolSchema(context.adapter, plan.selectedTypes);
    const response = await this.client.messages.create({
      model: this.generationModel,
      max_tokens: 4096,
      system: '生成题型补丁。只能修改计划 targetIds 内的节点，只能在 parentIds 指定的容器新增内容，不能触碰 excludedIds。必须调用 emit_patch 工具，不得输出全量 JSON。',
      messages: [{ role: 'user', content: JSON.stringify({ message: context.message, plan, outline: context.adapter.outline(context.outline), defaults: Object.fromEntries(plan.selectedTypes.map((type) => [type, context.adapter.defaultOptions(type)])) }) }],
      tools: [{ name: 'emit_patch', description: '输出 QuestionPatch', input_schema: toolSchema as unknown as { type: 'object'; [key: string]: unknown } }],
      tool_choice: { type: 'tool', name: 'emit_patch' },
    }, { signal: context.signal });
    this.recordUsage(response.usage);
    const block = response.content.find((item) => item.type === 'tool_use');
    if (!block || block.type !== 'tool_use') throw new Error('模型未返回 emit_patch tool_use');
    return block.input as QuestionPatch;
  }

  async repair(context: ProviderContext, plan: PlanResult, errors: ValidationIssue[]): Promise<QuestionPatch | null> {
    return this.generate({ ...context, message: `${context.message}\\n请修复以下错误，但不得扩大计划目标范围：${JSON.stringify(errors)}` }, plan);
  }

  getUsage(): ProviderUsage { return { ...this.usage }; }

  private recordUsage(usage: { input_tokens: number; output_tokens: number }): void {
    this.usage.inputTokens += usage.input_tokens;
    this.usage.outputTokens += usage.output_tokens;
  }
}
