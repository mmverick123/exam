import type { QuestionJson, QuestionPatch, ValidationIssue } from '@exam/lowcode/contract';

import type { PlanResult } from '../providers/types';
import { buildNodeRefs } from '../contracts/node-refs';
export { buildNodeRefs, summarizeRefs } from '../contracts/node-refs';


function issue(code: string, path: string, message: string): ValidationIssue {
  return { code, path, message, severity: 'error' };
}

export function validatePlanScope(plan: PlanResult): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  if ((plan.targetIds ?? []).length === 0) errors.push(issue('PLAN_TARGETS_MISSING', '', '计划没有明确目标组件，无法安全应用补丁'));
  if ((plan.targetIds ?? []).length > 12 || (plan.parentIds ?? []).length > 12) errors.push(issue('PLAN_SCOPE_TOO_BROAD', '', '计划影响范围过大，需要拆分请求或先澄清目标'));
  return errors;
}

export function validatePatchScope(outline: QuestionJson, patch: QuestionPatch, plan: PlanResult): ValidationIssue[] {
  const refs = new Map(buildNodeRefs(outline).map((ref) => [ref.id, ref]));
  const allowedTargets = new Set(plan.targetIds ?? []);
  const allowedParents = new Set(plan.parentIds ?? []);
  const createdIds = new Set<string>();
  const errors: ValidationIssue[] = validatePlanScope(plan);
  if (patch.ops.length > 32) errors.push(issue('PATCH_OPERATION_LIMIT_EXCEEDED', 'ops', '单次候选操作超过 32 项，请拆分为多个变更批次'));
  for (const [index, op] of patch.ops.entries()) {
    const targetId = op.op === 'insertChild' ? op.parentId : op.targetId;
    const isCreatedParent = op.op === 'insertChild' && createdIds.has(op.parentId);
    const isAllowed = op.op === 'insertChild'
      ? allowedParents.has(targetId) || isCreatedParent
      : allowedTargets.has(targetId);
    if (!isAllowed) {
      const ref = refs.get(targetId);
      errors.push(issue('PATCH_SCOPE_VIOLATION', `ops[${index}]`, `操作目标不在计划范围内：${ref ? `${ref.path} (${targetId})` : targetId}`));
      continue;
    }
    if (op.op === 'insertChild' && plan.selectedTypes.length > 0 && !plan.selectedTypes.includes(op.node.type)) {
      errors.push(issue('PATCH_TYPE_OUT_OF_SCOPE', `ops[${index}].node.type`, `新增组件类型 ${op.node.type} 不在计划允许范围内`));
    }
    if (plan.excludedIds?.includes(targetId)) errors.push(issue('PATCH_EXCLUDED_TARGET', `ops[${index}]`, `操作命中了计划排除的组件：${targetId}`));
    if (op.op === 'move' && !allowedParents.has(op.parentId) && !createdIds.has(op.parentId)) {
      errors.push(issue('PATCH_PARENT_OUT_OF_SCOPE', `ops[${index}].parentId`, `移动目标容器不在计划范围内：${op.parentId}`));
    }
    if (op.op === 'insertChild') createdIds.add(op.node.id);
  }
  return errors;
}
