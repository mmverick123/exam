import { describe, expect, it } from 'vitest';

import { extractToolInput, fallbackPlanResult, normalizePlanResult, parseModelJson } from '../src/providers/anthropic-provider';
import { buildContractBundles, resolveBundle } from '../src/contracts/bundles';
import { CONTRACT_VERSION, DEFAULT_FORM_CONFIG, type QuestionJson } from '@exam/lowcode/contract';

function context() {
  const outline: QuestionJson = { contractVersion: CONTRACT_VERSION, widgetList: [{ type: 'page', id: 'page_root', options: {}, widgetList: [] }], formConfig: { ...DEFAULT_FORM_CONFIG } };
  return { adapter: resolveBundle(CONTRACT_VERSION, buildContractBundles()), outline, message: '创建一道单选题' };
}

describe('Anthropic model JSON parsing', () => {
  it('accepts a fenced JSON response', () => {
    expect(parseModelJson<{ kind: string }>('```json\n{"kind":"create"}\n```', 'intent')).toEqual({ kind: 'create' });
  });

  it('accepts a JSON object surrounded by short prose', () => {
    expect(parseModelJson<{ steps: string[] }>('结果如下：\n{"steps":["新增题目"]}\n希望有帮助。', 'plan')).toEqual({ steps: ['新增题目'] });
  });

  it('reports a provider-specific error for invalid JSON', () => {
    expect(() => parseModelJson('not json', 'intent')).toThrow('intent 返回的内容不是有效 JSON');
  });

  it('fills safe plan defaults when the model omits selected types', () => {
    expect(normalizePlanResult({ steps: ['开始'] }, context())).toEqual({ steps: ['开始'], selectedTypes: ['stem', 'single-choice'] });
  });

  it('reads a forced plan tool response', () => {
    expect(extractToolInput([{ type: 'text' }, { type: 'tool_use', name: 'emit_plan', input: { steps: ['插入题目'], selectedTypes: ['single-choice'] } }], 'emit_plan'))
      .toEqual({ steps: ['插入题目'], selectedTypes: ['single-choice'] });
  });

  it('infers an explicitly requested widget type when plan JSON is unavailable', () => {
    expect(fallbackPlanResult({ ...context(), message: '创建一道关于光合作用的单选题，在两道单选题之间' })).toEqual({
      steps: ['根据用户描述生成并定位组件'],
      selectedTypes: ['single-choice'],
    });
  });
});
