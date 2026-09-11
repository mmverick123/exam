import { describe, expect, it } from 'vitest';

import { CONTRACT_VERSION, DEFAULT_FORM_CONFIG, validate, type QuestionJson } from '@exam/lowcode/contract';

import { buildContractBundles, resolveBundle, UnsupportedContractVersionError } from '../src/contracts/bundles';
import { buildEmitPatchToolSchema } from '../src/contracts/tool-schema';
import { DeterministicProvider, type AgentProvider } from '../src/providers';
import { runAgent } from '../src/application/state-machine';

function emptyOutline(): QuestionJson {
  return {
    contractVersion: CONTRACT_VERSION,
    widgetList: [{ type: 'page', id: 'page_root', options: {}, widgetList: [] }],
    formConfig: { ...DEFAULT_FORM_CONFIG },
  };
}

describe('Agent state machine', () => {
  it('creates a choice question as insertChild patch and validates the result', async () => {
    const result = await runAgent({
      message: '出一道关于光合作用的单选题，4 个选项',
      contractVersion: CONTRACT_VERSION,
      questionOutline: emptyOutline(),
    }, new DeterministicProvider());
    expect(result.state).toBe('Deliver');
    expect(result.intent?.kind).toBe('create');
    expect(result.patch?.ops[0]?.op).toBe('insertChild');
    expect(result.json && validate(result.json).errors).toEqual([]);
    expect(result.json?.widgetList[0]?.widgetList?.[0]?.type).toBe('single-choice');
  });

  it('forces non-empty canvas requests through modify intent', async () => {
    const outline = emptyOutline();
    outline.widgetList[0]!.widgetList!.push({ type: 'stem', id: 'stem_1', options: { content: '<p>已有题干</p>' } });
    const result = await runAgent({ message: '再出一道单选题', contractVersion: CONTRACT_VERSION, questionOutline: outline }, new DeterministicProvider());
    expect(result.intent?.kind).toBe('modify');
    expect(result.json?.widgetList[0]?.widgetList).toHaveLength(2);
  });

  it('repairs an invalid patch locally before delivery', async () => {
    const deterministic = new DeterministicProvider();
    let generated = 0;
    const provider: AgentProvider = {
      intent: (context) => deterministic.intent(context),
      plan: (context) => deterministic.plan(context),
      generate: async () => {
        generated += 1;
        return generated === 1
          ? { summary: '非法', ops: [{ op: 'remove', targetId: 'missing' }] }
          : deterministic.generate({ adapter: resolveBundle(CONTRACT_VERSION), outline: emptyOutline(), message: '出一道单选题，4 个选项' }, { steps: [], selectedTypes: ['single-choice'] });
      },
      repair: async (context, plan) => deterministic.generate(context, plan),
    };
    const result = await runAgent({ message: '出一道单选题，4 个选项', contractVersion: CONTRACT_VERSION, questionOutline: emptyOutline() }, provider);
    expect(result.state).toBe('Deliver');
    expect(result.repairCount).toBe(1);
  });

  it('rejects unsupported contract versions without fallback', async () => {
    await expect(runAgent({ message: '出一道题', contractVersion: '9.9.9', questionOutline: emptyOutline() }, new DeterministicProvider())).rejects.toBeInstanceOf(UnsupportedContractVersionError);
  });

  it('streams callbacks and returns the raw patch for one authoritative reconciliation', async () => {
    const outline = emptyOutline();
    outline.widgetList[0]!.widgetList!.push({ type: 'single-choice', id: 'choice_1', options: { name: 'choice', optionItems: [{ label: 'A', value: 'keep_a' }, { label: 'B', value: 'keep_b' }], correctAnswer: 'keep_a' } });
    const streamed: string[] = [];
    const result = await runAgent({ message: '加一个“以上都不对”选项', contractVersion: CONTRACT_VERSION, questionOutline: outline, onEvent: (event) => streamed.push(event.event) }, new DeterministicProvider());
    expect(streamed).toEqual(expect.arrayContaining(['plan', 'patch', 'done']));
    const op = result.patch?.ops[0];
    expect(op?.op).toBe('updateOptions');
    if (op?.op === 'updateOptions') expect((op.options.optionItems as Array<{ value: string }>).at(-1)?.value).toBe('model_new');
    expect((result.json?.widgetList[0]?.widgetList?.[0]?.options.optionItems as Array<{ value: string }>).slice(0, 2).map((item) => item.value)).toEqual(['keep_a', 'keep_b']);
  });

  it('repairs a modification whose result has a blocking validation warning', async () => {
    const outline = emptyOutline();
    outline.widgetList[0]!.widgetList!.push({ type: 'single-choice', id: 'choice_1', options: { name: 'choice', optionItems: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] } });
    const result = await runAgent({ message: '删除这道唯一的选择题', contractVersion: CONTRACT_VERSION, questionOutline: outline }, new DeterministicProvider());
    expect(result.state).toBe('Deliver');
    expect(result.repairCount).toBe(1);
    expect(result.patch?.summary).toContain('降级');
  });

  it('propagates cancellation and never enters later states', async () => {
    const controller = new AbortController();
    let generated = false;
    const provider: AgentProvider = {
      intent: (context) => new Promise((_resolve, reject) => context.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })),
      plan: async () => ({ steps: [], selectedTypes: [] }),
      generate: async () => { generated = true; return { summary: '', ops: [] }; },
      repair: async () => null,
    };
    const running = runAgent({ message: '出一道题', contractVersion: CONTRACT_VERSION, questionOutline: emptyOutline(), signal: controller.signal }, provider);
    controller.abort();
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    expect(generated).toBe(false);
  });
});

describe('contract adapter and structured tool schema', () => {
  it('does not expose page or image in the Agent component list', () => {
    const adapter = resolveBundle(CONTRACT_VERSION);
    const types = adapter.agentWidgetList().map((item) => item.type);
    expect(types).not.toContain('page');
    expect(types).not.toContain('image');
  });

  it('builds a strict emit_patch schema directly from selected option schemas', () => {
    const adapter = resolveBundle(CONTRACT_VERSION, buildContractBundles());
    const schema = buildEmitPatchToolSchema(adapter, ['stem', 'single-choice']);
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    const ops = schema.properties?.ops as { items?: { oneOf?: Array<{ properties?: Record<string, unknown> }> } };
    expect(ops.items?.oneOf).toHaveLength(4);
    expect(JSON.stringify(schema)).toContain('optionItems');
  });
});
