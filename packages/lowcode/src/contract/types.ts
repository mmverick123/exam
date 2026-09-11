export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type ComponentType =
  | 'CONTAINER'
  | 'DISPLAY_COMPONENT'
  | 'ANSWER_COMPONENT';

export type AnswerType = 'string' | 'string[]' | 'boolean';

export type XUi =
  | { widget: 'input' }
  | { widget: 'textarea'; rows?: number }
  | { widget: 'richtext' }
  | { widget: 'number'; min?: number; max?: number; step?: number }
  | { widget: 'switch' }
  | { widget: 'select'; options: Array<{ label: string; value: JsonPrimitive }> }
  | { widget: 'radio-group'; options: Array<{ label: string; value: JsonPrimitive }> }
  | { widget: 'url' }
  | { widget: 'option-editor' }
  | { widget: 'answer-select'; optionsFrom: string; multiple?: boolean }
  | { widget: 'hidden' };

export interface JSONSchema {
  $id?: string;
  $schema?: string;
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema;
  items?: JSONSchema;
  enum?: JsonPrimitive[];
  const?: JsonPrimitive;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  allOf?: JSONSchema[];
  $ref?: string;
  'x-ui'?: XUi;
}

export interface WidgetDefinition {
  type: string;
  displayName: string;
  aiHint: string;
  componentType: ComponentType;
  allowedChildTypes?: string[];
  internal?: boolean;
  agentExcluded?: boolean;
  answerType?: AnswerType;
  designOnlyOptionKeys?: string[];
  defaultOptions: Record<string, JsonValue>;
  optionsSchema: JSONSchema;
}

export interface WidgetNode {
  type: string;
  id: string;
  options: Record<string, JsonValue>;
  widgetList?: WidgetNode[];
}

export interface FormConfig {
  labelPosition: 'top' | 'left';
  labelWidth: number;
  size: 'default' | 'small' | 'large';
  layoutType: 'PC' | 'H5';
}

export interface QuestionJson {
  contractVersion: string;
  widgetList: WidgetNode[];
  formConfig: FormConfig;
}

export type QuestionPatchOp =
  | { op: 'insertChild'; parentId: string; afterId: string | null; node: WidgetNode }
  | { op: 'remove'; targetId: string }
  | { op: 'updateOptions'; targetId: string; options: Record<string, JsonValue> }
  | { op: 'move'; targetId: string; parentId: string; afterId: string | null };

export interface QuestionPatch {
  ops: QuestionPatchOp[];
  summary: string;
}

export type ValidationSeverity = 'error' | 'warn-block' | 'warn-pass';

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: ValidationSeverity;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
