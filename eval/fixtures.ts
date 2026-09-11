import { CONTRACT_VERSION, DEFAULT_FORM_CONFIG, normalizeJson, type QuestionJson, type WidgetNode } from '@exam/lowcode/contract';

import type { EvalSetup } from './types';

const choice = (id: string, name: string, title: string, prefix: string): WidgetNode => ({
  type: 'single-choice',
  id,
  options: {
    title,
    name,
    score: 2,
    optionItems: [0, 1, 2, 3].map((index) => ({ label: `选项 ${index + 1}`, value: `${prefix}_${index + 1}` })),
    correctAnswer: `${prefix}_2`,
    optionsLayout: id === 'choice_2' ? 'horizontal' : 'vertical',
  },
});

export function fixture(setup: EvalSetup): QuestionJson {
  const children: WidgetNode[] = setup === 'empty' ? [] : [choice('choice_1', 'answer_1', '第一小问', 'stable_a')];
  if (setup === 'twoChoices') children.push(choice('choice_2', 'answer_2', '第二小问', 'stable_b'));
  if (setup === 'group') {
    children.splice(0, children.length, {
      type: 'question-group', id: 'group_1', options: { title: '材料题', showIndex: true, gap: 24 }, widgetList: [
        { type: 'essay', id: 'essay_1', options: { title: '分析材料', name: 'essay_1', score: 5 } },
      ],
    });
  }
  return normalizeJson({
    contractVersion: CONTRACT_VERSION,
    widgetList: [{ type: 'page', id: 'page_eval', options: {}, widgetList: children }],
    formConfig: { ...DEFAULT_FORM_CONFIG },
  });
}
