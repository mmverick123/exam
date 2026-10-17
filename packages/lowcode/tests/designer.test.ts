import { describe, expect, it } from 'vitest';

import {
  applyQuestionPatch,
  type QuestionPatch,
} from '../src/contract';
import { createDesignerStore } from '../src/designer';
import { fixtureFile } from './helpers';

describe('designer store and patch application', () => {
  it('adds nodes with normalized defaults and supports one-step undo', () => {
    const store = createDesignerStore();
    const pageId = store.getJson().widgetList[0]!.id;
    const group = store.insertNode('question-group', pageId);
    expect(store.getJson().widgetList[0]!.widgetList).toHaveLength(1);
    store.insertNode('single-choice', group.id);
    const choice = store.getJson().widgetList[0]!.widgetList![0]!.widgetList![0]!;
    expect(choice.options.name).toBe('single_choice_1');
    expect(choice.options.optionItems).toEqual([]);
    expect(store.validate().errors).toEqual([]);
    expect(store.undo()).toBe(true);
    expect(store.getJson().widgetList[0]!.widgetList![0]!.widgetList).toHaveLength(0);
  });

  it('resolves temporary parent ids and preserves existing option values', () => {
    const base = structuredClone(fixtureFile.valid);
    const pageId = base.widgetList[0]!.id;
    const patch: QuestionPatch = {
      summary: '新增组合题',
      ops: [
        {
          op: 'insertChild',
          parentId: pageId,
          afterId: null,
          node: { type: 'question-group', id: 'tmp-group', options: {}, widgetList: [] },
        },
        {
          op: 'insertChild',
          parentId: 'tmp-group',
          afterId: null,
          node: { type: 'single-choice', id: 'tmp-choice', options: { name: 'single_choice', optionItems: [{ label: 'A', value: 'model-a' }, { label: 'B', value: 'model-b' }] } },
        },
      ],
    };
    const applied = applyQuestionPatch(base, patch);
    const group = applied.json.widgetList[0]!.widgetList![0]!;
    const choice = group.widgetList![0]!;
    expect(applied.idMap.get('tmp-group')).not.toBe('tmp-group');
    expect(choice.id).not.toBe('tmp-choice');
    expect(choice.options.optionItems).toHaveLength(2);

    const existingPatch: QuestionPatch = {
      summary: '重排选项',
      ops: [{
        op: 'updateOptions',
        targetId: 'single_1',
        options: {
          optionItems: [
            { label: '4', value: 'opt_b' },
            { label: '3', value: 'opt_a' },
            { label: '都不对', value: 'model-new' },
          ],
          correctAnswer: 'opt_b',
        },
      }],
    };
    const reordered = applyQuestionPatch(base, existingPatch).json.widgetList[0]!.widgetList![1]!;
    const values = (reordered.options.optionItems as Array<{ value: string }>).map((item) => item.value);
    expect(values.slice(0, 2)).toEqual(['opt_b', 'opt_a']);
    expect(values[2]).not.toBe('model-new');
    expect(reordered.options.correctAnswer).toBe('opt_b');
  });

  it('rejects a patch whose anchor is removed without mutating the input', () => {
    const base = structuredClone(fixtureFile.valid);
    expect(() => applyQuestionPatch(base, {
      summary: '冲突',
      ops: [
        { op: 'remove', targetId: 'stem_1' },
        { op: 'insertChild', parentId: 'page_root', afterId: 'stem_1', node: { type: 'divider', id: 'tmp', options: {} } },
      ],
    })).toThrow();
    expect(base.widgetList[0]!.widgetList).toHaveLength(2);
  });

  it('deduplicates names across nested temporary inserts and rejects descendant moves', () => {
    const base = structuredClone(fixtureFile.valid);
    const applied = applyQuestionPatch(base, { summary: '嵌套新增', ops: [
      { op: 'insertChild', parentId: 'page_root', afterId: null, node: { type: 'question-group', id: 'tmp_group', options: {}, widgetList: [] } },
      { op: 'insertChild', parentId: 'tmp_group', afterId: null, node: { type: 'essay', id: 'tmp_1', options: { name: 'essay' } } },
      { op: 'insertChild', parentId: 'tmp_group', afterId: 'tmp_1', node: { type: 'essay', id: 'tmp_2', options: { name: 'essay' } } },
    ] });
    const group = applied.json.widgetList[0]!.widgetList![0]!;
    expect(group.widgetList?.map((node) => node.options.name)).toEqual(['essay', 'essay_2']);
    expect(() => applyQuestionPatch(applied.json, { summary: '循环移动', ops: [{ op: 'move', targetId: group.id, parentId: group.widgetList![0]!.id, afterId: null }] })).toThrow(/descendant/);
  });

  it('moves nodes through the Zustand store as one patch and supports redo', () => {
    const store = createDesignerStore();
    const pageId = store.getJson().widgetList[0]!.id;
    const first = store.insertNode('stem', pageId);
    const second = store.insertNode('divider', pageId, first.id);
    store.moveNode(first.id, pageId, second.id);
    expect(store.getJson().widgetList[0]!.widgetList?.map((node) => node.type)).toEqual(['divider', 'stem']);
    expect(store.undo()).toBe(true);
    expect(store.getJson().widgetList[0]!.widgetList?.map((node) => node.type)).toEqual(['stem', 'divider']);
    expect(store.redo()).toBe(true);
    expect(store.getJson().widgetList[0]!.widgetList?.map((node) => node.type)).toEqual(['divider', 'stem']);
  });

  it('preserves unrelated node references and selector notifications', () => {
    const store = createDesignerStore(structuredClone(fixtureFile.valid));
    const before = store.getSnapshot().json;
    const beforeStem = store.getNode('stem_1');
    const beforeChoice = store.getNode('single_1');
    let stemNotifications = 0;
    let choiceNotifications = 0;
    const findById = (id: string) => (state: ReturnType<typeof store.getSnapshot>) => {
      const nodes = state.json.widgetList[0]?.widgetList ?? [];
      return nodes.find((node) => node.id === id) ?? null;
    };
    const unsubscribeStem = store.subscribeSelector(findById('stem_1'), () => { stemNotifications += 1; });
    const unsubscribeChoice = store.subscribeSelector(findById('single_1'), () => { choiceNotifications += 1; });

    store.updateOptions('stem_1', { content: '<p>changed</p>' });

    const after = store.getSnapshot().json;
    expect(after).not.toBe(before);
    expect(store.getNode('stem_1')).not.toBe(beforeStem);
    expect(store.getNode('single_1')).toBe(beforeChoice);
    expect(after.widgetList[0]!.widgetList?.[1]).toBe(before.widgetList[0]!.widgetList?.[1]);
    expect(stemNotifications).toBe(1);
    expect(choiceNotifications).toBe(0);
    unsubscribeStem();
    unsubscribeChoice();
  });

  it('does not reuse a removed child list during structural sharing', () => {
    const store = createDesignerStore(structuredClone(fixtureFile.valid));
    store.removeNode('single_1');
    expect(store.getSnapshot().json.widgetList[0]!.widgetList).toEqual([
      expect.objectContaining({ id: 'stem_1' }),
    ]);
    expect(store.validate().warnings.some((warning) => warning.code === 'NO_ANSWER_COMPONENT')).toBe(true);
  });
});
