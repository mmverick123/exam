import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildAnswerData, containerComponents, fieldComponents, QuestionRenderer } from '../src/renderer';
import { fixtureFile } from './helpers';

describe('renderer component registry and answer model', () => {
  it('exports all field and container components from the contract registry', () => {
    expect(Object.keys(fieldComponents).sort()).toEqual([
      'divider',
      'essay',
      'fill-blank',
      'form-checkbox',
      'form-date',
      'form-input',
      'form-radio',
      'form-select',
      'form-switch',
      'form-textarea',
      'image',
      'judge',
      'multi-choice',
      'single-choice',
      'stem',
    ]);
    expect(Object.keys(containerComponents).sort()).toEqual(['page', 'question-group']);
  });

  it('flattens answer fields and applies external > defaultValue > null precedence', () => {
    const json = structuredClone(fixtureFile.valid);
    json.widgetList[0]!.widgetList!.push({
      type: 'question-group',
      id: 'group',
      options: { title: '', gap: 16 },
      widgetList: [
        {
          type: 'fill-blank',
          id: 'fill',
          options: {
            title: '',
            name: 'fill_answer',
            score: 0,
            defaultValue: '预填',
            labelPosition: 'inherit',
            maxLength: 200,
            placeholder: '',
            width: 240,
          },
        },
      ],
    });
    expect(buildAnswerData(json, { answer_1: 'opt_a', fill_answer: '外部值' })).toEqual({
      answer_1: 'opt_a',
      fill_answer: '外部值',
    });
    expect(buildAnswerData(json)).toEqual({ answer_1: null, fill_answer: '预填' });
  });
});

describe('renderer modes and safety behavior', () => {
  it('renders answer controls and disables controls in readonly mode', () => {
    const answerMarkup = renderToStaticMarkup(
      React.createElement(QuestionRenderer, { json: fixtureFile.valid, mode: 'answer' }),
    );
    const readonlyMarkup = renderToStaticMarkup(
      React.createElement(QuestionRenderer, { json: fixtureFile.valid, mode: 'readonly' }),
    );
    expect(answerMarkup).toContain('type="radio"');
    expect(readonlyMarkup).toContain('disabled=""');
  });

  it('sanitizes stem HTML and shows a design placeholder for empty choices', () => {
    const json = structuredClone(fixtureFile.valid);
    json.widgetList[0]!.widgetList![0]!.options.content = '<p>safe</p><script>alert(1)</script><strong>ok</strong>';
    const markup = renderToStaticMarkup(
      React.createElement(QuestionRenderer, { json, mode: 'preview' }),
    );
    expect(markup).toContain('safe');
    expect(markup).not.toContain('<script>');

    const emptyChoice = structuredClone(fixtureFile.valid.widgetList[0]!.widgetList![1]!);
    emptyChoice.options.optionItems = [];
    const Choice = fieldComponents['single-choice']!;
    const designMarkup = renderToStaticMarkup(
      React.createElement(Choice, { node: emptyChoice, mode: 'design', value: null }),
    );
    expect(designMarkup).toContain('添加选项后在此显示选项');
  });
});
