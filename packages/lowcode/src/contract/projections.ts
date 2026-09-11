import { getWidgetDefinition } from './registry';
import type { JsonValue, QuestionJson, WidgetNode } from './types';

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

export function deepEqualJson(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => deepEqualJson(value, right[index]));
  }
  if (typeof left !== 'object') return false;

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(rightRecord, key) &&
        deepEqualJson(leftRecord[key], rightRecord[key]),
    )
  );
}

export function normalizeNode(node: WidgetNode): WidgetNode {
  const definition = getWidgetDefinition(node.type);
  if (!definition) throw new Error(`Unknown widget type: ${node.type}`);

  const normalized: WidgetNode = {
    type: node.type,
    id: node.id,
    options: {
      ...cloneJson(definition.defaultOptions),
      ...cloneJson(node.options),
    },
  };
  if (node.widgetList !== undefined) {
    normalized.widgetList = node.widgetList.map(normalizeNode);
  }
  return normalized;
}

export function normalizeJson(json: QuestionJson): QuestionJson {
  return {
    contractVersion: json.contractVersion,
    widgetList: json.widgetList.map(normalizeNode),
    formConfig: cloneJson(json.formConfig),
  };
}

function outlineNode(node: WidgetNode): WidgetNode {
  const definition = getWidgetDefinition(node.type);
  if (!definition) return cloneJson(node);

  const required = new Set(definition.optionsSchema.required ?? []);
  const options: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(node.options)) {
    const hasDefault = Object.hasOwn(definition.defaultOptions, key);
    if (
      !required.has(key) &&
      hasDefault &&
      deepEqualJson(value, definition.defaultOptions[key])
    ) {
      continue;
    }
    options[key] = cloneJson(value);
  }

  const outlined: WidgetNode = { type: node.type, id: node.id, options };
  if (node.widgetList !== undefined) {
    outlined.widgetList = node.widgetList.map(outlineNode);
  }
  return outlined;
}

export function outlineForAgent(json: QuestionJson): QuestionJson {
  return {
    contractVersion: json.contractVersion,
    widgetList: json.widgetList.map(outlineNode),
    formConfig: cloneJson(json.formConfig),
  };
}

function projectNodeForExam(node: WidgetNode): WidgetNode {
  const projected = cloneJson(node);
  const definition = getWidgetDefinition(projected.type);
  for (const key of definition?.designOnlyOptionKeys ?? []) {
    delete projected.options[key];
  }
  if (projected.widgetList !== undefined) {
    projected.widgetList = projected.widgetList.map(projectNodeForExam);
  }
  return projected;
}

export function projectForExam(json: QuestionJson): QuestionJson {
  return {
    contractVersion: json.contractVersion,
    widgetList: json.widgetList.map(projectNodeForExam),
    formConfig: cloneJson(json.formConfig),
  };
}
