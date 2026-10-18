import type { QuestionJson, QuestionPatch } from '@exam/lowcode/contract';

export interface AgentPreviewTarget { id: string; type: string; label: string; path: string; }

export interface CandidateGroup { id: string; label: string; ops: QuestionPatch['ops']; selected: boolean; risk: 'low' | 'high'; }

export function snapshotHash(json: QuestionJson): string {
  const text = JSON.stringify(json);
  let first = 2166136261;
  let second = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 2246822519);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

export function buildCandidateGroups(patch: QuestionPatch, targets: AgentPreviewTarget[]): CandidateGroup[] {
  const destructive = patch.ops.filter((op) => op.op === 'remove' || op.op === 'move');
  const safe = patch.ops.filter((op) => op.op !== 'remove' && op.op !== 'move');
  const groups: CandidateGroup[] = [];
  if (destructive.length) {
    groups.push({ id: 'high-risk', label: `包含删除/移动的整组改动（${patch.ops.length} 项，需显式勾选）`, ops: patch.ops, selected: false, risk: 'high' });
    return groups;
  }
  const inserts = safe.filter((op) => op.op === 'insertChild');
  const insertedIds = new Set(inserts.map((op) => op.op === 'insertChild' ? op.node.id : ''));
  const dependentUpdates = safe.filter((op) => op.op === 'updateOptions' && insertedIds.has(op.targetId));
  const independentUpdates = safe.filter((op) => op.op === 'updateOptions' && !insertedIds.has(op.targetId));
  if (inserts.length) groups.push({ id: 'inserts', label: `新增组件及其后续配置（${inserts.length + dependentUpdates.length} 项，作为一个依赖组）`, ops: [...inserts, ...dependentUpdates], selected: true, risk: 'low' });
  const updates = independentUpdates;
  const byTarget = new Map<string, QuestionPatch['ops']>();
  for (const op of updates) { if (op.op !== 'updateOptions') continue; const bucket = byTarget.get(op.targetId) ?? []; bucket.push(op); byTarget.set(op.targetId, bucket); }
  for (const [targetId, ops] of byTarget) { const target = targets.find((item) => item.id === targetId); groups.push({ id: `update-${targetId}`, label: `修改「${target?.label ?? '组件'}」的配置（${ops.length} 项）`, ops, selected: true, risk: 'low' }); }
  if (!groups.length) groups.push({ id: 'all', label: `本次改动（${patch.ops.length} 项）`, ops: patch.ops, selected: true, risk: 'low' });
  return groups;
}

