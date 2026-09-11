import type { ReactNode } from 'react';

import type { QuestionJson, ValidationResult, WidgetNode } from '../../contract';

export type RenderMode = 'answer' | 'readonly' | 'preview';
export type FieldMode = RenderMode | 'design';
export type AnswerData = Record<string, unknown>;

export interface FieldProps {
  node: WidgetNode;
  mode: FieldMode;
  value: unknown;
  onChange?: (value: unknown) => void;
}

export interface ContainerProps {
  node: WidgetNode;
  mode: FieldMode;
  children: ReactNode;
}

export interface QuestionRendererHandle {
  getAnswerData: () => AnswerData;
  validate: () => ValidationResult;
  setJson: (json: QuestionJson) => void;
  reset: () => void;
}
