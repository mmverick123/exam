import { getWidgetDefinition, isContainer, isFormItem } from './registry';
import { normalizeNode, normalizeJson } from './projections';
import type {
  JsonValue,
  QuestionJson,
  QuestionPatch,
  QuestionPatchOp,
  WidgetNode,
} from './types';

export interface PatchApplicationResult {
  json: QuestionJson;
  patch: QuestionPatch;
  idMap: Map<string, string>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function newIdentifier(prefix: string): string {
  const random = globalThis.crypto?.getRandomValues
    ? Array.from(globalThis.crypto.getRandomValues(new Uint32Array(2)))
        .map((part) => part.toString(36))
        .join('')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

function walk(nodes: WidgetNode[], callback: (node: WidgetNode, parent: WidgetNode | undefined, index: number) => void, parent?: WidgetNode): void {
  nodes.forEach((node, index) => {
    callback(node, parent, index);
    if (node.widgetList) walk(node.widgetList, callback, node);
  });
}

function findNode(json: QuestionJson, id: string): { node: WidgetNode; parent?: WidgetNode; index: number } | undefined {
  let found: { node: WidgetNode; parent?: WidgetNode; index: number } | undefined;
  walk(json.widgetList, (node, parent, index) => {
    if (!found && node.id === id) {
      found = parent === undefined ? { node, index } : { node, parent, index };
    }
  });
  return found;
}

function containsNode(node: WidgetNode, id: string): boolean {
  if (node.id === id) return true;
  return node.widgetList?.some((child) => containsNode(child, id)) ?? false;
}

function allIds(json: QuestionJson): Set<string> {
  const ids = new Set<string>();
  walk(json.widgetList, (node) => ids.add(node.id));
  return ids;
}

function allNames(json: QuestionJson, exceptId?: string): Set<string> {
  const names = new Set<string>();
  walk(json.widgetList, (node) => {
    if (node.id !== exceptId && isFormItem(node.type) && typeof node.options.name === 'string') {
      names.add(node.options.name);
    }
  });
  return names;
}

function uniqueName(json: QuestionJson, requested: string, exceptId?: string): string {
  const names = allNames(json, exceptId);
  if (!names.has(requested)) return requested;
  let suffix = 2;
  while (names.has(`${requested}_${suffix}`)) suffix += 1;
  return `${requested}_${suffix}`;
}

function uniqueValue(existing: Set<string>): string {
  let value = newIdentifier('opt');
  while (existing.has(value)) value = newIdentifier('opt');
  existing.add(value);
  return value;
}

function normalizeInsertedNode(json: QuestionJson, input: WidgetNode, preservedValues: Set<string> = new Set()): WidgetNode {
  const node = normalizeNode(input);
  const oldValues = new Map<string, string>();
  const existingValues = new Set<string>();
  walk(json.widgetList, (current) => {
    if (Array.isArray(current.options.optionItems)) {
      for (const item of current.options.optionItems) {
        if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).value === 'string') {
          existingValues.add((item as { value: string }).value);
        }
      }
    }
  });
  if (Array.isArray(node.options.optionItems)) {
    const remappedItems: JsonValue[] = [];
    for (const item of node.options.optionItems) {
      if (!item || typeof item !== 'object') continue;
      const source = item as Record<string, JsonValue>;
      const sourceValue = typeof source.value === 'string' ? source.value : '';
      const nextValue = preservedValues.has(sourceValue) && sourceValue.length > 0
        ? sourceValue
        : uniqueValue(existingValues);
      oldValues.set(sourceValue, nextValue);
      remappedItems.push({ ...clone(source), value: nextValue });
    }
    node.options.optionItems = remappedItems;
    if (node.options.correctAnswer !== undefined) {
      node.options.correctAnswer = Array.isArray(node.options.correctAnswer)
        ? node.options.correctAnswer.map((value) => oldValues.get(String(value)) ?? value)
        : oldValues.get(String(node.options.correctAnswer)) ?? node.options.correctAnswer;
    }
  }
  if (isFormItem(node.type) && typeof node.options.name === 'string') {
    node.options.name = uniqueName(json, node.options.name);
  }
  return node;
}

function remapReference(id: string | null, idMap: Map<string, string>): string | null {
  return id === null ? null : idMap.get(id) ?? id;
}

function collectRemovedIds(ops: QuestionPatchOp[]): Set<string> {
  return new Set(ops.filter((op): op is Extract<QuestionPatchOp, { op: 'remove' }> => op.op === 'remove').map((op) => op.targetId));
}

function preflight(json: QuestionJson, patch: QuestionPatch): void {
  if (!Array.isArray(patch.ops)) throw new Error('Patch ops must be an array');
  const ids = allIds(json);
  const removed = collectRemovedIds(patch.ops);
  const inserted = new Set<string>();
  for (const op of patch.ops) {
    if (op.op === 'insertChild') {
      if (!ids.has(op.parentId) && !inserted.has(op.parentId)) throw new Error(`Unknown patch parent: ${op.parentId}`);
      if (op.afterId !== null && !ids.has(op.afterId) && !inserted.has(op.afterId)) throw new Error(`Unknown patch anchor: ${op.afterId}`);
      const definition = getWidgetDefinition(op.node.type);
      if (!definition) throw new Error(`Unknown inserted widget type: ${op.node.type}`);
      if (!isContainer(op.node.type) && op.node.widgetList !== undefined) throw new Error('Leaf insert cannot contain widgetList');
      inserted.add(op.node.id);
    } else if (op.op === 'remove') {
      if (!ids.has(op.targetId) && !inserted.has(op.targetId)) throw new Error(`Unknown patch target: ${op.targetId}`);
    } else if (op.op === 'updateOptions') {
      if (!ids.has(op.targetId) || removed.has(op.targetId)) throw new Error(`Invalid update target: ${op.targetId}`);
    } else {
      if (!ids.has(op.targetId) || removed.has(op.targetId)) throw new Error(`Invalid move target: ${op.targetId}`);
      if (!ids.has(op.parentId) || removed.has(op.parentId)) throw new Error(`Invalid move parent: ${op.parentId}`);
      if (op.afterId !== null && (!ids.has(op.afterId) || removed.has(op.afterId))) throw new Error(`Invalid move anchor: ${op.afterId}`);
      const target = findNode(json, op.targetId)?.node;
      if (target && containsNode(target, op.parentId)) throw new Error('Cannot move a node into itself or its descendant');
      if (op.afterId === op.targetId) throw new Error('A moved node cannot anchor itself');
    }
  }
  for (const op of patch.ops) {
    if (op.op !== 'insertChild' && op.op !== 'move') continue;
    if (op.afterId !== null && removed.has(op.afterId)) throw new Error(`Patch anchor is removed: ${op.afterId}`);
  }
}

export function reconcilePatch(json: QuestionJson, patch: QuestionPatch): { patch: QuestionPatch; idMap: Map<string, string> } {
  preflight(json, patch);
  const working = clone(json);
  const ids = allIds(working);
  const idMap = new Map<string, string>();
  const ops: QuestionPatchOp[] = [];
  const preservedValues = new Set<string>();
  for (const source of patch.ops) {
    if (source.op === 'insertChild') {
      const parentId = idMap.get(source.parentId) ?? source.parentId;
      const afterId = remapReference(source.afterId, idMap);
      const node = normalizeInsertedNode(working, source.node, preservedValues);
      const oldId = node.id;
      let newId = newIdentifier(node.type.replaceAll('-', '_'));
      while (ids.has(newId)) newId = newIdentifier(node.type.replaceAll('-', '_'));
      ids.add(newId);
      idMap.set(oldId, newId);
      node.id = newId;
      const op: QuestionPatchOp = { op: 'insertChild', parentId, afterId, node };
      insertInto(working, { ...op, node: clone(node) });
      ops.push(op);
    } else if (source.op === 'remove') {
      const targetId = idMap.get(source.targetId) ?? source.targetId;
      const found = findNode(working, targetId);
      if (!found?.parent?.widgetList) throw new Error(`Invalid remove target: ${targetId}`);
      if (Array.isArray(found.node.options.optionItems)) {
        for (const item of found.node.options.optionItems) {
          if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).value === 'string') preservedValues.add((item as { value: string }).value);
        }
      }
      found.parent.widgetList.splice(found.index, 1);
      ops.push({ op: 'remove', targetId });
    } else if (source.op === 'move') {
      const op: QuestionPatchOp = {
        op: 'move',
        targetId: idMap.get(source.targetId) ?? source.targetId,
        parentId: idMap.get(source.parentId) ?? source.parentId,
        afterId: remapReference(source.afterId, idMap),
      };
      moveWithin(working, op);
      ops.push(op);
    } else {
      const targetId = idMap.get(source.targetId) ?? source.targetId;
      const target = findNode(working, targetId)?.node;
      const options = clone(source.options);
      if (target && Array.isArray(options.optionItems) && Array.isArray(target.options.optionItems)) {
        const existingValues = new Set(
          target.options.optionItems
            .filter((item) => item && typeof item === 'object')
            .map((item) => (item as { value?: unknown }).value)
            .filter((value): value is string => typeof value === 'string'),
        );
        const valueMap = new Map<string, string>();
        options.optionItems = options.optionItems.map((item) => {
          if (!item || typeof item !== 'object') return item;
          const sourceItem = item as Record<string, JsonValue>;
          const sourceValue = typeof sourceItem.value === 'string' ? sourceItem.value : '';
          const value = existingValues.has(sourceValue) ? sourceValue : uniqueValue(existingValues);
          valueMap.set(sourceValue, value);
          return { ...clone(sourceItem), value };
        });
        if (options.correctAnswer !== undefined) {
          options.correctAnswer = Array.isArray(options.correctAnswer)
            ? options.correctAnswer.map((value) => valueMap.get(String(value)) ?? value)
            : valueMap.get(String(options.correctAnswer)) ?? options.correctAnswer;
        }
      }
      if (target && isFormItem(target.type) && typeof options.name === 'string') {
        options.name = uniqueName(working, options.name, target.id);
      }
      if (!target) throw new Error(`Invalid update target: ${targetId}`);
      target.options = { ...target.options, ...clone(options) };
      ops.push({ op: 'updateOptions', targetId, options });
    }
  }
  return { patch: { ...clone(patch), ops }, idMap };
}

function insertInto(json: QuestionJson, op: Extract<QuestionPatchOp, { op: 'insertChild' }>): void {
  const parent = findNode(json, op.parentId)?.node;
  if (!parent || !isContainer(parent.type) || !parent.widgetList) throw new Error(`Invalid insert parent: ${op.parentId}`);
  const definition = getWidgetDefinition(parent.type);
  if (!definition?.allowedChildTypes?.includes(op.node.type)) throw new Error(`${op.node.type} is not allowed in ${parent.type}`);
  const anchorIndex = op.afterId === null ? -1 : parent.widgetList.findIndex((child) => child.id === op.afterId);
  if (op.afterId !== null && anchorIndex < 0) throw new Error(`Invalid insert anchor: ${op.afterId}`);
  const index = anchorIndex + 1;
  parent.widgetList.splice(index, 0, op.node);
}

function moveWithin(json: QuestionJson, op: Extract<QuestionPatchOp, { op: 'move' }>): void {
  const found = findNode(json, op.targetId);
  const parent = findNode(json, op.parentId)?.node;
  if (!found || !found.parent?.widgetList || !parent || !isContainer(parent.type) || !parent.widgetList) throw new Error('Invalid move operation');
  if (containsNode(found.node, parent.id)) throw new Error('Cannot move a node into itself or its descendant');
  const definition = getWidgetDefinition(parent.type);
  if (!definition?.allowedChildTypes?.includes(found.node.type)) throw new Error(`${found.node.type} is not allowed in ${parent.type}`);
  found.parent.widgetList.splice(found.index, 1);
  const anchorIndex = op.afterId === null ? -1 : parent.widgetList.findIndex((child) => child.id === op.afterId);
  if (op.afterId !== null && anchorIndex < 0) throw new Error(`Invalid move anchor: ${op.afterId}`);
  parent.widgetList.splice(anchorIndex + 1, 0, found.node);
}

export function applyQuestionPatch(json: QuestionJson, patch: QuestionPatch): PatchApplicationResult {
  const reconciled = reconcilePatch(json, patch);
  const next = clone(json);
  for (const op of reconciled.patch.ops) {
    if (op.op === 'insertChild') insertInto(next, { ...op, node: clone(op.node) });
    else if (op.op === 'remove') {
      const found = findNode(next, op.targetId);
      if (!found || !found.parent?.widgetList) throw new Error(`Invalid remove target: ${op.targetId}`);
      found.parent.widgetList.splice(found.index, 1);
    } else if (op.op === 'updateOptions') {
      const found = findNode(next, op.targetId);
      if (!found) throw new Error(`Invalid update target: ${op.targetId}`);
      found.node.options = { ...found.node.options, ...clone(op.options) };
    } else {
      moveWithin(next, op);
    }
  }
  return { json: normalizeJson(next), patch: reconciled.patch, idMap: reconciled.idMap };
}
