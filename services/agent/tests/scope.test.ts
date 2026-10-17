import { describe, expect, it } from 'vitest';

import { CONTRACT_VERSION, DEFAULT_FORM_CONFIG, type QuestionJson, type QuestionPatch } from '@exam/lowcode/contract';
import { validatePatchScope } from '../src/application/scope';
import type { PlanResult } from '../src/providers/types';

const outline: QuestionJson = {
  contractVersion: CONTRACT_VERSION,
  widgetList: [{
    type: 'page', id: 'page_root', options: {}, widgetList: [
      { type: 'single-choice', id: 'choice_a', options: { title: '目标题', name: 'target', optionItems: [] } },
      { type: 'single-choice', id: 'choice_b', options: { title: '其他题', name: 'other', optionItems: [] } },
    ],
  }],
  formConfig: { ...DEFAULT_FORM_CONFIG },
};

const basePlan: PlanResult = {
  steps: ['修改目标题'], selectedTypes: ['stem', 'single-choice'],
  targetIds: ['choice_a'], parentIds: ['page_root'], excludedIds: ['choice_b'],
};

describe('Agent patch scope guard', () => {
  it('rejects a patch that targets a valid but unplanned component', () => {
    const patch: QuestionPatch = { summary: '误改其他题', ops: [{ op: 'remove', targetId: 'choice_b' }] };
    expect(validatePatchScope(outline, patch, basePlan).map((item) => item.code)).toContain('PATCH_SCOPE_VIOLATION');
  });

  it('allows an explicitly planned target and an approved insertion parent', () => {
    const patch: QuestionPatch = {
      summary: '修改目标题并新增题干',
      ops: [
        { op: 'updateOptions', targetId: 'choice_a', options: { title: '更新后的标题' } },
        { op: 'insertChild', parentId: 'page_root', afterId: 'choice_a', node: { type: 'stem', id: 'tmp_stem', options: {} } },
        { op: 'insertChild', parentId: 'tmp_stem', afterId: null, node: { type: 'single-choice', id: 'tmp_choice', options: {} } },
      ],
    };
    expect(validatePatchScope(outline, patch, basePlan)).toEqual([]);
  });

  it('rejects oversized patches before they can be previewed', () => {
    const patch: QuestionPatch = { summary: '超大补丁', ops: Array.from({ length: 33 }, () => ({ op: 'updateOptions' as const, targetId: 'choice_a', options: { title: '更新' } })) };
    expect(validatePatchScope(outline, patch, basePlan).map((item) => item.code)).toContain('PATCH_OPERATION_LIMIT_EXCEEDED');
  });

  it('rejects moving a planned component into a container outside the plan', () => {
    const next = structuredClone(outline);
    next.widgetList[0]!.widgetList!.push({ type: 'question-group', id: 'group_other', options: {}, widgetList: [] });
    const patch: QuestionPatch = { summary: '移出计划范围', ops: [{ op: 'move', targetId: 'choice_a', parentId: 'group_other', afterId: null }] };
    expect(validatePatchScope(next, patch, basePlan).map((item) => item.code)).toContain('PATCH_PARENT_OUT_OF_SCOPE');
  });
});
