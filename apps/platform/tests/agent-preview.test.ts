import { describe, expect, it } from 'vitest';

import { CONTRACT_VERSION, DEFAULT_FORM_CONFIG, type QuestionJson, type QuestionPatch } from '@exam/lowcode/contract';
import { buildCandidateGroups, snapshotHash } from '../src/frontend/services/agent-preview';

const outline: QuestionJson = {
  contractVersion: CONTRACT_VERSION,
  widgetList: [{ type: 'page', id: 'page', options: {}, widgetList: [{ type: 'single-choice', id: 'choice', options: {} }] }],
  formConfig: { ...DEFAULT_FORM_CONFIG },
};

const targets = [{ id: 'choice', type: 'single-choice', label: '目标题', path: '题型 / 目标题' }];

describe('Agent candidate preview helpers', () => {
  it('produces a stable hash and detects canvas content changes', () => {
    expect(snapshotHash(outline)).toBe(snapshotHash(structuredClone(outline)));
    const changed = structuredClone(outline);
    changed.widgetList[0]!.widgetList![0]!.options.title = 'changed';
    expect(snapshotHash(changed)).not.toBe(snapshotHash(outline));
  });

  it('keeps nested insertions and their temporary-node updates in one dependency group', () => {
    const patch: QuestionPatch = { summary: 'create nested structure', ops: [
      { op: 'insertChild', parentId: 'page', afterId: null, node: { type: 'question-group', id: 'tmp-group', options: {}, widgetList: [] } },
      { op: 'insertChild', parentId: 'tmp-group', afterId: null, node: { type: 'single-choice', id: 'tmp-choice', options: {} } },
      { op: 'updateOptions', targetId: 'tmp-choice', options: { title: 'nested' } },
      { op: 'updateOptions', targetId: 'choice', options: { title: 'independent' } },
    ] };
    const groups = buildCandidateGroups(patch, targets);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.ops).toHaveLength(3);
    expect(groups[1]?.ops).toHaveLength(1);
  });

  it('keeps destructive changes atomic and unchecked until explicit user consent', () => {
    const patch: QuestionPatch = { summary: 'delete and modify', ops: [
      { op: 'remove', targetId: 'choice' },
      { op: 'updateOptions', targetId: 'choice', options: { title: 'updated' } },
    ] };
    const groups = buildCandidateGroups(patch, targets);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.risk).toBe('high');
    expect(groups[0]?.selected).toBe(false);
    expect(groups[0]?.ops).toHaveLength(2);
  });
});
