import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';

import {
  isContainer,
  isFormItem,
  normalizeJson,
  validate,
  type QuestionJson,
  type WidgetNode,
} from '../../contract';
import {
  DividerWidget,
  EssayWidget,
  FormCheckboxWidget,
  FormDateWidget,
  FormInputWidget,
  FormRadioWidget,
  FormSelectWidget,
  FormSwitchWidget,
  FormTextareaWidget,
  FillBlankWidget,
  ImageWidget,
  JudgeWidget,
  MultiChoiceWidget,
  PageContainer,
  QuestionGroupContainer,
  SingleChoiceWidget,
  StemWidget,
} from './widgets';
import type {
  AnswerData,
  ContainerProps,
  FieldMode,
  FieldProps,
  QuestionRendererHandle,
  RenderMode,
} from '../model/types';

export const fieldComponents: Record<string, React.FC<FieldProps>> = {
  stem: StemWidget,
  image: ImageWidget,
  divider: DividerWidget,
  'single-choice': SingleChoiceWidget,
  'multi-choice': MultiChoiceWidget,
  judge: JudgeWidget,
  'fill-blank': FillBlankWidget,
  essay: EssayWidget,
  'form-input': FormInputWidget,
  'form-textarea': FormTextareaWidget,
  'form-select': FormSelectWidget,
  'form-radio': FormRadioWidget,
  'form-checkbox': FormCheckboxWidget,
  'form-switch': FormSwitchWidget,
  'form-date': FormDateWidget,
};

export const containerComponents: Record<string, React.FC<ContainerProps>> = {
  page: PageContainer,
  'question-group': QuestionGroupContainer,
};

export interface QuestionRendererProps {
  json: QuestionJson;
  answerData?: AnswerData;
  mode: RenderMode;
  onChange?: (answerData: AnswerData) => void;
  className?: string;
}

function collectAnswerData(nodes: WidgetNode[], answers: AnswerData, answerData: AnswerData): void {
  for (const node of nodes) {
    if (isFormItem(node.type) && typeof node.options.name === 'string') {
      const name = node.options.name;
      answers[name] = Object.hasOwn(answerData, name) ? answerData[name] : node.options.defaultValue ?? null;
    }
    if (node.widgetList) collectAnswerData(node.widgetList, answers, answerData);
  }
}

/** Build the flat answer model used by the renderer (groups do not create keys). */
export function buildAnswerData(json: QuestionJson, answerData: AnswerData = {}): AnswerData {
  const result: AnswerData = {};
  collectAnswerData(json.widgetList, result, answerData);
  return result;
}

function RenderNode({ node, mode, answerData, onAnswerChange }: {
  node: WidgetNode;
  mode: RenderMode;
  answerData: AnswerData;
  onAnswerChange: (name: string, value: unknown) => void;
}) {
  if (isContainer(node.type)) {
    const Container = containerComponents[node.type];
    if (!Container) return null;
    return (
      <Container node={node} mode={mode}>
        {(node.widgetList ?? []).map((child) => (
          <RenderNode key={child.id} node={child} mode={mode} answerData={answerData} onAnswerChange={onAnswerChange} />
        ))}
      </Container>
    );
  }
  const Field = fieldComponents[node.type];
  if (!Field) return null;
  const name = typeof node.options.name === 'string' ? node.options.name : node.id;
  return (
    <Field
      node={node}
      mode={mode as FieldMode}
      value={answerData[name] ?? null}
      onChange={(value) => onAnswerChange(name, value)}
    />
  );
}

export const QuestionRenderer = forwardRef<QuestionRendererHandle, QuestionRendererProps>(
  function QuestionRenderer({ json, answerData: initialAnswerData = {}, mode, onChange, className }, ref) {
    const initialJson = useRef(normalizeJson(json));
    const [currentJson, setCurrentJson] = useState<QuestionJson>(initialJson.current);
    const [answers, setAnswers] = useState<AnswerData>(() => buildAnswerData(initialJson.current, initialAnswerData));

    const updateAnswer = (name: string, value: unknown) => {
      setAnswers((previous) => {
        const next = { ...previous, [name]: value };
        if (mode === 'answer') onChange?.(next);
        return next;
      });
    };

    useImperativeHandle(ref, () => ({
      getAnswerData: () => ({ ...answers }),
      validate: () => validate(currentJson),
      setJson: (nextJson) => {
        const result = validate(nextJson);
        if (result.errors.length > 0) {
          throw new Error(`Invalid QuestionJson: ${result.errors.map((error) => error.message).join('; ')}`);
        }
        const normalized = normalizeJson(nextJson);
        setCurrentJson(normalized);
        setAnswers((previous) => {
          const next: AnswerData = {};
          collectAnswerData(normalized.widgetList, next, previous);
          return next;
        });
      },
      reset: () => {
        const resetAnswers: AnswerData = {};
        collectAnswerData(currentJson.widgetList, resetAnswers, {});
        setAnswers(resetAnswers);
      },
    }), [answers, currentJson]);

    return (
      <div className={className ?? 'exam-renderer'} data-mode={mode}>
        {currentJson.widgetList.map((node) => (
          <RenderNode key={node.id} node={node} mode={mode} answerData={answers} onAnswerChange={updateAnswer} />
        ))}
      </div>
    );
  },
);

QuestionRenderer.displayName = 'QuestionRenderer';
