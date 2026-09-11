import assert from 'node:assert/strict';
import { CONTRACT_VERSION, DEFAULT_FORM_CONFIG, applyQuestionPatch, validate, type QuestionJson } from '../packages/lowcode/src/contract/index';
import { createDesignerStore } from '../packages/lowcode/src/designer/index';
import { DeterministicProvider } from '../services/agent/src/providers';
import { runAgent } from '../services/agent/src/application/state-machine';
import { buildAgentServer } from '../services/agent/src/transport/http/server';
import { buildServer } from '../apps/platform/src/backend/http/server';

const empty = (): QuestionJson => ({ contractVersion: CONTRACT_VERSION, widgetList: [{ type: 'page', id: 'page', options: {}, widgetList: [] }], formConfig: { ...DEFAULT_FORM_CONFIG } });
const checks: string[] = [];
const pass = (text: string) => checks.push(`PASS ${text}`);

async function main() {
  const initial = empty();
  const seeded = createDesignerStore(initial);
  const page = seeded.getJson().widgetList[0]!.id;
  seeded.insertNode('single-choice', page);
  seeded.insertNode('single-choice', page);
  const seededJson = seeded.getJson();
  const secondId = seededJson.widgetList[0]!.widgetList![1]!.id;
  seeded.updateOptions(secondId, { optionItems: [{ label: 'A', value: 'keep_a' }, { label: 'B', value: 'keep_b' }], correctAnswer: 'keep_a' });
  const before = seeded.getJson();
  const result = await runAgent({ message: '把第二小问改成多选并加一个“以上都不对”选项', contractVersion: CONTRACT_VERSION, questionOutline: before }, new DeterministicProvider());
  assert.equal(result.intent?.kind, 'modify'); assert.equal(result.state, 'Deliver'); assert.equal(result.patch?.ops.length, 2);
  const valuesBefore = before.widgetList[0]!.widgetList![1]!.options.optionItems.map((x) => x.value);
  const applied = applyQuestionPatch(before, result.patch!);
  assert.deepEqual(applied.json.widgetList[0]!.widgetList![1]!.options.optionItems.slice(0, valuesBefore.length).map((x) => x.value), valuesBefore);
  assert.deepEqual(applied.json.widgetList[0]!.widgetList![1]!.options.correctAnswer, [before.widgetList[0]!.widgetList![1]!.options.correctAnswer]);
  assert.equal(validate(applied.json).errors.length, 0); pass('第二小问多选改写、选项 value 保留并通过校验');

  const designer = createDesignerStore(before); designer.applyPatch(result.patch!); assert.equal(designer.undo(), true); assert.deepEqual(designer.getJson(), before); pass('Agent 补丁确认后一次 undo 完整回退');

  const nested = await runAgent({ message: '新增一道材料分析题，含 2 个子问', contractVersion: CONTRACT_VERSION, questionOutline: empty() }, new DeterministicProvider());
  assert.equal(nested.patch?.ops.filter((op) => op.op === 'insertChild').length, 4); const nestedJson = applyQuestionPatch(empty(), nested.patch!).json; assert.equal(validate(nestedJson).errors.length, 0); pass('临时父节点嵌套 insertChild 经重整后无断链');

  const anchor = empty(); anchor.widgetList[0]!.widgetList!.push({ type: 'stem', id: 'a', options: { content: '<p>a</p>' } }, { type: 'stem', id: 'b', options: { content: '<p>b</p>' } });
  assert.throws(() => applyQuestionPatch(anchor, { summary: '非法', ops: [{ op: 'remove', targetId: 'b' }, { op: 'move', targetId: 'a', parentId: 'page', afterId: 'b' }] })); pass('同补丁删除锚点时原子拒绝');

  const nonEmpty = await runAgent({ message: '再出一道单选题', contractVersion: CONTRACT_VERSION, questionOutline: applied.json }, new DeterministicProvider());
  assert.equal(nonEmpty.intent?.kind, 'modify'); assert.equal(nonEmpty.patch?.ops[0]?.op, 'insertChild'); assert.equal(applyQuestionPatch(applied.json, nonEmpty.patch!).json.widgetList[0]!.widgetList!.length, 3); pass('非空画布追加题目不覆盖既有节点');

  const groupJson = nestedJson;
  const invalidNesting = await runAgent({ message: '在组合题里再插一个 question-group 组合题', contractVersion: CONTRACT_VERSION, questionOutline: groupJson }, new DeterministicProvider());
  assert.equal(invalidNesting.state, 'Deliver'); assert.equal(invalidNesting.repairCount, 1); assert.equal(validate(invalidNesting.json).errors.length, 0); pass('组合题自嵌套被 Validate 拦截并 Repair 为合法补丁');

  const beforeReverseValues = applied.json.widgetList[0]!.widgetList![1]!.options.optionItems.map((x) => x.value);
  const reversed = applyQuestionPatch(applied.json, { summary: '倒序', ops: [{ op: 'updateOptions', targetId: applied.json.widgetList[0]!.widgetList![1]!.id, options: { optionItems: [...applied.json.widgetList[0]!.widgetList![1]!.options.optionItems].reverse() } }] }).json;
  assert.deepEqual(new Set(reversed.widgetList[0]!.widgetList![1]!.options.optionItems.map((x) => x.value)), new Set(beforeReverseValues)); pass('选项乱序仍保留原 value 集合');

  const agentServer = buildAgentServer();
  const agentAddress = await agentServer.listen({ host: '127.0.0.1', port: 0 });
  const platformServer = buildServer(undefined, { agentUrl: agentAddress });
  const platformAddress = await platformServer.listen({ host: '127.0.0.1', port: 0 });
  try {
    const response = await fetch(`${platformAddress}/api/agent/chat`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer dev-token' }, body: JSON.stringify({ sessionId: 'step5-e2e', message: '再出一道单选题', contractVersion: CONTRACT_VERSION, questionOutline: applied.json }) });
    const sse = await response.text();
    assert.equal(response.status, 200); assert.equal(response.headers.get('x-accel-buffering'), 'no'); assert.match(sse, /event: plan[\s\S]+event: patch[\s\S]+event: validation[\s\S]+event: done/); pass('真实 platform → Agent SSE 反代按序流转且关闭缓冲');
    const unsupported = await fetch(`${platformAddress}/api/agent/chat`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer dev-token' }, body: JSON.stringify({ message: '出题', contractVersion: '9.9.9', questionOutline: applied.json }) });
    assert.match(await unsupported.text(), /UNSUPPORTED_CONTRACT_VERSION/); pass('不支持的契约版本经 SSE 显式返回错误');
  } finally { await platformServer.close(); await agentServer.close(); }

  process.stdout.write(`${checks.join('\n')}\n\n${checks.length} checks passed.\n`);
}
void main();
