import { isFormItem, validate, type QuestionJson, type WidgetNode } from '@exam/lowcode/contract';

import type { AgentResult } from '../src/application/state-machine';
import type { EvalCase, FailureMode } from './types';

function walk(nodes: WidgetNode[]): WidgetNode[] {
  return nodes.flatMap((node) => [node, ...walk(node.widgetList ?? [])]);
}

const values = (node: WidgetNode | undefined): string[] => Array.isArray(node?.options.optionItems)
  ? node.options.optionItems.map((item) => String((item as { value?: unknown }).value ?? ''))
  : [];

export function assertCase(testCase: EvalCase, initial: QuestionJson, result: AgentResult): string[] {
  const errors: string[] = [];
  if (result.state !== 'Deliver' || !result.json || !result.patch) return [`Agent 未交付合法补丁：${result.state}`];
  const validation = validate(result.json);
  if (validation.errors.length > 0) errors.push(`契约校验失败：${validation.errors.map((item) => item.code).join(',')}`);
  const before = walk(initial.widgetList);
  const after = walk(result.json.widgetList);
  const answers = after.filter((node) => isFormItem(node.type));
  if (testCase.expect.answerTypes) {
    const actual = Object.fromEntries([...new Set(answers.map((node) => node.type))].map((type) => [type, answers.filter((node) => node.type === type).length]));
    for (const [type, count] of Object.entries(testCase.expect.answerTypes)) if ((actual[type] ?? 0) !== count) errors.push(`${type} 数量期望 ${count}，实际 ${actual[type] ?? 0}`);
    if (answers.length !== Object.values(testCase.expect.answerTypes).reduce((sum, count) => sum + count, 0)) errors.push(`答案组件总数不符：${answers.length}`);
  }
  const targetIndex = testCase.expect.targetIndex ?? 0;
  const targetAfter = answers[targetIndex];
  const beforeAnswers = before.filter((node) => isFormItem(node.type));
  const targetBefore = beforeAnswers[targetIndex];
  if (testCase.expect.optionCount !== undefined && values(targetAfter).length !== testCase.expect.optionCount) errors.push(`选项数期望 ${testCase.expect.optionCount}，实际 ${values(targetAfter).length}`);
  const groups = after.filter((node) => node.type === 'question-group');
  if (testCase.expect.groupCount !== undefined && groups.length !== testCase.expect.groupCount) errors.push(`组合题数量不符：${groups.length}`);
  if (testCase.expect.groupChildCount !== undefined && groups[0]?.widgetList?.length !== testCase.expect.groupChildCount) errors.push(`组合题子节点数量不符`);
  if (testCase.expect.nodeDelta !== undefined && after.length - before.length !== testCase.expect.nodeDelta) errors.push(`节点增量期望 ${testCase.expect.nodeDelta}，实际 ${after.length - before.length}`);
  if (testCase.expect.preserveValues && !values(targetBefore).every((value) => values(targetAfter).includes(value))) errors.push('既有 option value 被改写');
  if (testCase.expect.reverseValues && JSON.stringify(values(targetAfter)) !== JSON.stringify([...values(targetBefore)].reverse())) errors.push('选项顺序未按 value 完整反转');
  if (testCase.expect.preserveUnmentioned) {
    const touched = new Set(result.patch.ops.flatMap((op) => 'targetId' in op ? [op.targetId] : []));
    for (const node of before.filter((item) => !item.widgetList && !touched.has(item.id))) {
      const current = after.find((item) => item.id === node.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(node)) errors.push(`未提及节点 ${node.id} 被修改`);
    }
  }
  const pageChildren = result.json.widgetList[0]?.widgetList ?? [];
  if (testCase.expect.movedToEnd && pageChildren.at(-1)?.id !== testCase.expect.movedToEnd) errors.push(`${testCase.expect.movedToEnd} 未移动到末尾`);
  if (testCase.expect.movedToStart && pageChildren[0]?.id !== testCase.expect.movedToStart) errors.push(`${testCase.expect.movedToStart} 未移动到开头`);
  if (testCase.expect.requiresRepair && result.repairCount === 0) errors.push('期望触发 Repair，实际未触发');
  return errors;
}

export function classifyFailure(result: AgentResult | undefined, assertionErrors: string[], thrown?: unknown): FailureMode[] {
  const modes = new Set<FailureMode>();
  if (thrown instanceof SyntaxError) modes.add('structured-output');
  const validationIssues = (result?.events ?? [])
    .filter((event) => event.event === 'validation' && event.data.valid === false)
    .flatMap((event) => Array.isArray(event.data.errors) ? event.data.errors as Array<{ code?: unknown }> : []);
  for (const issue of [...(result?.errors ?? []), ...validationIssues]) {
    const code = String(issue.code ?? '');
    if (code.includes('CHILD') || code.includes('ROOT') || code.includes('CONTAINER') || String((issue as { message?: unknown }).message ?? '').includes('not allowed')) modes.add('hierarchy');
    else if (code.includes('OPTIONS') || code.includes('DEFAULT_VALUE')) modes.add('options-type');
    else if (code.includes('NAME')) modes.add('name-conflict');
    else if (code.includes('CORRECT_ANSWER')) modes.add('correct-answer-range');
    else modes.add('other');
  }
  if (assertionErrors.length > 0) modes.add('structure-mismatch');
  return [...modes];
}
