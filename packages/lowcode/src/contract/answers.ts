import { getWidgetDefinition, isFormItem } from './registry';
import type { AnswerType, JsonValue, QuestionJson, WidgetNode } from './types';

export interface AnswerFieldDefinition {
  name: string;
  type: string;
  answerType: AnswerType;
  maxLength?: number;
}

export interface AnswerDataIssue {
  code: string;
  path: string;
  message: string;
}

export interface AnswerDataValidationResult {
  valid: boolean;
  errors: AnswerDataIssue[];
}

function collectNode(node: WidgetNode, fields: AnswerFieldDefinition[]): void {
  const definition = getWidgetDefinition(node.type);
  if (definition && isFormItem(node.type) && definition.answerType) {
    const name = node.options.name;
    if (typeof name === 'string') {
      const maxLength = typeof node.options.maxLength === 'number' ? node.options.maxLength : undefined;
      const field: AnswerFieldDefinition = { name, type: node.type, answerType: definition.answerType };
      if (maxLength !== undefined) field.maxLength = maxLength;
      fields.push(field);
    }
  }
  node.widgetList?.forEach((child) => collectNode(child, fields));
}

export function collectAnswerFields(json: QuestionJson): AnswerFieldDefinition[] {
  const fields: AnswerFieldDefinition[] = [];
  json.widgetList.forEach((node) => collectNode(node, fields));
  return fields;
}

function matchesAnswerType(value: JsonValue, answerType: AnswerType): boolean {
  if (answerType === 'string') return typeof value === 'string';
  if (answerType === 'boolean') return typeof value === 'boolean';
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function validateAnswerData(
  json: QuestionJson,
  answerData: unknown,
): AnswerDataValidationResult {
  const errors: AnswerDataIssue[] = [];
  if (typeof answerData !== 'object' || answerData === null || Array.isArray(answerData)) {
    return {
      valid: false,
      errors: [{ code: 'ANSWER_DATA_INVALID', path: '', message: 'answerData 必须是对象' }],
    };
  }

  const fields = new Map(collectAnswerFields(json).map((field) => [field.name, field]));
  const data = answerData as Record<string, unknown>;
  for (const [name, value] of Object.entries(data)) {
    const field = fields.get(name);
    if (!field) {
      errors.push({
        code: 'ANSWER_KEY_UNKNOWN',
        path: `/answerData/${name}`,
        message: `未知答案 key：${name}`,
      });
      continue;
    }
    if (value === null) continue;
    if (!matchesAnswerType(value as JsonValue, field.answerType)) {
      errors.push({
        code: 'ANSWER_TYPE_INVALID',
        path: `/answerData/${name}`,
        message: `${name} 的答案类型应为 ${field.answerType}`,
      });
      continue;
    }
    if (field.maxLength !== undefined && typeof value === 'string' && value.length > field.maxLength) {
      errors.push({
        code: 'ANSWER_TOO_LONG',
        path: `/answerData/${name}`,
        message: `${name} 的答案超过最大长度 ${field.maxLength}`,
      });
    }
  }
  return { valid: errors.length === 0, errors };
}
