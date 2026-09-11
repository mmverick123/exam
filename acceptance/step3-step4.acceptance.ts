import assert from 'node:assert/strict';

import {
  CONTRACT_VERSION,
  validate,
  validateAnswerData,
  validateForPublish,
  type QuestionJson,
} from '../packages/lowcode/src/contract/index';
import { createDesignerStore } from '../packages/lowcode/src/designer/index';
import { buildAnswerData } from '../packages/lowcode/src/renderer/index';
import { QuestionTypeStore, PlatformError } from '../apps/platform/src/backend/domain/question-type-store';
import { DeterministicProvider } from '../services/agent/src/providers';
import { runAgent } from '../services/agent/src/application/state-machine';
import { resolveBundle } from '../services/agent/src/contracts/bundles';

async function main(): Promise<void> {
const checks: string[] = [];
const pass = (message: string) => checks.push(`PASS ${message}`);

const platform = new QuestionTypeStore();
const record = platform.create({ name: '光合作用单选题', subject: '生物' });
const firstVersion = record.versions.get(1)!;
assert.equal(firstVersion.formJson.widgetList[0]?.type, 'page');
assert.equal(firstVersion.formJson.widgetList[0]?.widgetList?.length, 0);
pass('新题型首版包含可保存的空 page');

const adapterTypes = resolveBundle(CONTRACT_VERSION).agentWidgetList().map((widget) => widget.type);
assert(!adapterTypes.includes('page'));
assert(!adapterTypes.includes('image'));
pass('Agent Plan 清单排除 page 与 image');

const agentResult = await runAgent({
  sessionId: 'acceptance-session',
  message: '出一道关于光合作用的单选题，4 个选项',
  contractVersion: CONTRACT_VERSION,
  questionOutline: firstVersion.formJson,
}, new DeterministicProvider());
assert.equal(agentResult.state, 'Deliver');
assert.equal(agentResult.patch?.ops[0]?.op, 'insertChild');
assert.deepEqual(validate(agentResult.json).errors, []);
pass('Agent 生成 insertChild patch，应用后通过契约校验');

const designer = createDesignerStore(firstVersion.formJson);
designer.applyPatch(agentResult.patch!);
assert.deepEqual(designer.validate().errors, []);
assert.equal(designer.getJson().widgetList[0]?.widgetList?.[0]?.type, 'single-choice');
pass('Designer 接收 Agent patch 并形成合法单选题');

assert.equal(designer.undo(), true);
assert.equal(designer.getJson().widgetList[0]?.widgetList?.length, 0);
assert.equal(designer.redo(), true);
assert.equal(designer.getJson().widgetList[0]?.widgetList?.length, 1);
pass('整次 Agent patch 可一步 undo/redo');

const nestedDesigner = createDesignerStore();
const nestedPageId = nestedDesigner.getJson().widgetList[0]!.id;
const group = nestedDesigner.insertNode('question-group', nestedPageId);
assert.throws(() => nestedDesigner.insertNode('question-group', group.id));
pass('allowedChildTypes 在落位阶段拒绝 question-group 自嵌套');

const noAnswerKeyJson = designer.getJson();
delete noAnswerKeyJson.widgetList[0]!.widgetList![0]!.options.correctAnswer;
assert.equal(validateForPublish(noAnswerKeyJson).valid, true);
pass('未设置 correctAnswer 只产生 warn-pass，允许发布');

const saved = platform.saveVersion(record, designer.getJson(), 1);
assert.equal(saved.version, 2);
platform.publish(record, 2);
const published = platform.getPublished(record)!;
assert.equal(published.version, 2);
assert(!JSON.stringify(published.json).includes('correctAnswer'));
pass('保存、服务端发布门禁与消费端正确答案剥离闭环通过');

const answers = buildAnswerData(published.json);
assert.deepEqual(validateAnswerData(published.json, answers).errors, []);
assert.equal(Object.values(answers).every((value) => value === null), true);
pass('Renderer 构造答案模型，null 未作答可通过提交校验');

const invalidAnswerJson: QuestionJson = structuredClone(designer.getJson());
invalidAnswerJson.widgetList[0]!.widgetList![0]!.options.correctAnswer = 'not-exists';
const invalidSnapshot = platform.saveVersion(record, invalidAnswerJson, 0);
assert.throws(
  () => platform.publish(record, invalidSnapshot.version),
  (error) => error instanceof PlatformError && error.code === 'PUBLISH_VALIDATION_FAILED',
);
assert.equal(record.publishedVersion, 2);
pass('直接调用 publish 无法绕过非法 correctAnswer 门禁');

process.stdout.write(`${checks.join('\n')}\n\n${checks.length} checks passed.\n`);
}

void main();
