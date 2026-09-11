import {
  applyQuestionPatch,
  CONTRACT_VERSION,
  DEFAULT_FORM_CONFIG,
  getWidgetDefinition,
  normalizeJson,
  validate,
  type JsonValue,
  type QuestionJson,
  type QuestionPatch,
  type ValidationResult,
  type WidgetNode,
} from '../../contract';

export interface DesignerStore {
  getJson(): QuestionJson;
  setJson(json: QuestionJson): void;
  applyPatch(patch: QuestionPatch): void;
  insertNode(type: string, parentId: string, afterId?: string | null): WidgetNode;
  updateOptions(nodeId: string, options: Record<string, JsonValue>): void;
  removeNode(nodeId: string): void;
  validate(): ValidationResult;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  subscribe(listener: () => void): () => void;
}

function randomId(prefix: string): string {
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${value.replaceAll('-', '').slice(0, 16)}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createEmptyQuestionJson(): QuestionJson {
  return {
    contractVersion: CONTRACT_VERSION,
    widgetList: [{ type: 'page', id: randomId('page'), options: {}, widgetList: [] }],
    formConfig: { ...DEFAULT_FORM_CONFIG },
  };
}

class DesignerStoreImpl implements DesignerStore {
  private json: QuestionJson;
  private history: QuestionJson[];
  private cursor: number;
  private listeners = new Set<() => void>();

  constructor(initial: QuestionJson = createEmptyQuestionJson()) {
    const normalized = normalizeJson(initial);
    const result = validate(normalized);
    if (result.errors.length > 0) throw new Error(`Invalid initial QuestionJson: ${result.errors[0]?.message}`);
    this.json = normalized;
    this.history = [clone(normalized)];
    this.cursor = 0;
  }

  getJson(): QuestionJson {
    return clone(this.json);
  }

  setJson(json: QuestionJson): void {
    const result = validate(json);
    if (result.errors.length > 0) throw new Error(`Invalid QuestionJson: ${result.errors.map((item) => item.message).join('; ')}`);
    this.commit(normalizeJson(json));
  }

  applyPatch(patch: QuestionPatch): void {
    const result = applyQuestionPatch(this.json, patch);
    const validation = validate(result.json);
    if (validation.errors.length > 0) throw new Error(`Patch produced invalid QuestionJson: ${validation.errors.map((item) => item.message).join('; ')}`);
    this.commit(result.json);
  }

  insertNode(type: string, parentId: string, afterId: string | null = null): WidgetNode {
    const definition = getWidgetDefinition(type);
    if (!definition) throw new Error(`Unknown widget type: ${type}`);
    const node: WidgetNode = { type, id: randomId(type.replaceAll('-', '_')), options: clone(definition.defaultOptions) };
    if (definition.componentType === 'CONTAINER') node.widgetList = [];
    if (definition.answerType && typeof node.options.name === 'string') {
      const names = new Set<string>();
      const visit = (nodes: WidgetNode[]) => nodes.forEach((item) => {
        if (typeof item.options.name === 'string') names.add(item.options.name);
        if (item.widgetList) visit(item.widgetList);
      });
      visit(this.json.widgetList);
      const base = node.options.name;
      let index = 1;
      while (names.has(`${base}_${index}`)) index += 1;
      node.options.name = `${base}_${index}`;
    }
    const applied = applyQuestionPatch(this.json, { summary: `新增${definition.displayName}`, ops: [{ op: 'insertChild', parentId, afterId, node }] });
    const validation = validate(applied.json);
    if (validation.errors.length > 0) throw new Error(`Patch produced invalid QuestionJson: ${validation.errors.map((item) => item.message).join('; ')}`);
    this.commit(applied.json);
    const insertedId = applied.idMap.get(node.id) ?? node.id;
    return clone(findNode(applied.json.widgetList, insertedId) ?? node);
  }

  updateOptions(nodeId: string, options: Record<string, JsonValue>): void {
    this.applyPatch({ summary: '更新组件属性', ops: [{ op: 'updateOptions', targetId: nodeId, options }] });
  }

  removeNode(nodeId: string): void {
    this.applyPatch({ summary: '删除组件', ops: [{ op: 'remove', targetId: nodeId }] });
  }

  validate(): ValidationResult {
    return validate(this.json);
  }

  undo(): boolean {
    if (!this.canUndo()) return false;
    this.cursor -= 1;
    this.json = clone(this.history[this.cursor]!);
    this.emit();
    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) return false;
    this.cursor += 1;
    this.json = clone(this.history[this.cursor]!);
    this.emit();
    return true;
  }

  canUndo(): boolean { return this.cursor > 0; }
  canRedo(): boolean { return this.cursor < this.history.length - 1; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(next: QuestionJson): void {
    this.json = clone(next);
    this.history = this.history.slice(0, this.cursor + 1);
    this.history.push(clone(next));
    if (this.history.length > 31) this.history.shift();
    this.cursor = this.history.length - 1;
    this.emit();
  }

  private emit(): void { this.listeners.forEach((listener) => listener()); }
}

function findNode(nodes: WidgetNode[], id: string): WidgetNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = node.widgetList && findNode(node.widgetList, id);
    if (child) return child;
  }
  return undefined;
}

export function createDesignerStore(initial?: QuestionJson): DesignerStore {
  return new DesignerStoreImpl(initial);
}
