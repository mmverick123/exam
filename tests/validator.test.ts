import { describe, expect, it } from 'vitest';

import { projectForExam, validate, validateForPublish } from '../src/contract';
import { fixtureFile } from './helpers';

describe('contract validator fixtures', () => {
  it('accepts the hand-written valid fixture', () => {
    const result = validate(fixtureFile.valid);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it.each(fixtureFile.invalid)('rejects $name', ({ json, expectedCodes }) => {
    const codes = validate(json).errors.map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining(expectedCodes));
  });

  it('runs top-level prechecks before structural validation', () => {
    const result = validate({ contractVersion: '1.0.0', formConfig: {} });
    expect(result.errors.map((item) => item.code)).toContain('WIDGET_LIST_INVALID');
    expect(result.errors.map((item) => item.code)).not.toContain('ROOT_PAGE_INVALID');
  });
});

describe('warning levels and publish gate', () => {
  it('covers every warning rule and blocks only warn-block issues', () => {
    const draft = {
      contractVersion: '1.0.0',
      widgetList: [
        {
          type: 'page',
          id: 'root',
          options: {},
          widgetList: [
            { type: 'image', id: 'image', options: { src: '' } },
            {
              type: 'single-choice',
              id: 'single',
              options: {
                name: 'single',
                optionItems: [{ label: 'A', value: 'a' }],
                correctAnswer: 'outside',
              },
            },
            { type: 'judge', id: 'judge', options: { name: 'judge' } },
          ],
        },
      ],
      formConfig: {
        labelPosition: 'top',
        labelWidth: 100,
        size: 'default',
        layoutType: 'PC',
      },
    };

    const result = validate(draft);
    const warningCodes = result.warnings.map((item) => item.code);
    expect(warningCodes).toEqual(
      expect.arrayContaining([
        'IMAGE_SRC_EMPTY',
        'OPTION_ITEMS_TOO_FEW',
        'CORRECT_ANSWER_OUT_OF_RANGE',
        'CORRECT_ANSWER_MISSING',
        'TOTAL_SCORE_ZERO',
      ]),
    );
    expect(validateForPublish(draft).valid).toBe(false);
  });

  it('reports no-answer as publish-blocking', () => {
    const noAnswer = structuredClone(fixtureFile.valid);
    noAnswer.widgetList[0]!.widgetList = noAnswer.widgetList[0]!.widgetList!.filter(
      (node) => node.type === 'stem',
    );
    const result = validate(noAnswer);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'NO_ANSWER_COMPONENT', severity: 'warn-block' }),
    );
  });
});

describe('consumer projection', () => {
  it('removes design-only fields recursively and remains valid', () => {
    const projected = projectForExam(fixtureFile.valid);
    const options = projected.widgetList[0]!.widgetList![1]!.options;
    expect(options).not.toHaveProperty('correctAnswer');
    expect(validate(projected).errors).toEqual([]);
    expect(
      fixtureFile.valid.widgetList[0]!.widgetList![1]!.options,
    ).toHaveProperty('correctAnswer');
  });
});
