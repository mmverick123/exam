import { createStore, type StoreApi } from 'zustand/vanilla';

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

export interface DesignerState {
  json: QuestionJson;
  selectedId: string | null;
  draggingId: string | null;
  dropTargetId: string | null;
  dropPosition: 'before' | 'after' | 'inside' | null;
}

export interface DesignerStore {
  getJson(): QuestionJson;
  setJson(json: QuestionJson): void;
  applyPatch(patch: QuestionPatch): void;
  insertNode(type: string, parentId: string, afterId?: string | null): WidgetNode;
  moveNode(nodeId: string, parentId: string, afterId: string | null): void;
  updateOptions(nodeId: string, options: Record<string, JsonValue>): void;
  removeNode(nodeId: string): void;
  validate(): ValidationResult;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  getState(): DesignerState;
  subscribe(listener: () => void): () => void;
}

const clone = <T,>(value: T): T => structuredClone(value);

function randomId(prefix: string): string {
  const value =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${value.replaceAll('-', '').slice(0, 16)}`;
}

export function createEmptyQuestionJson(): QuestionJson {
  return {
    contractVersion: CONTRACT_VERSION,
    widgetList: [
      {
        type: 'page',
        id: randomId('page'),
        options: {},
        widgetList: [],
      },
    ],
    formConfig: { ...DEFAULT_FORM_CONFIG },
  };
}

function findNode(nodes: WidgetNode[], id: string): WidgetNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = node.widgetList && findNode(node.widgetList, id);
    if (child) return child;
  }
  return undefined;
}

class DesignerStoreImpl implements DesignerStore {
  private readonly state: StoreApi<DesignerState>;
  private history: QuestionJson[];
  private cursor = 0;

  constructor(initial: QuestionJson = createEmptyQuestionJson()) {
    const normalized = normalizeJson(initial);
    const result = validate(normalized);
    if (result.errors.length > 0) {
      throw new Error(
        `Invalid initial QuestionJson: ${result.errors[0]?.message}`,
      );
    }

    this.state = createStore<DesignerState>(() => ({
      json: normalized,
      selectedId: null,
      draggingId: null,
      dropTargetId: null,
      dropPosition: null,
    }));
    this.history = [clone(normalized)];
  }

  getJson(): QuestionJson {
    return clone(this.state.getState().json);
  }

  getState(): DesignerState {
    return this.state.getState();
  }

  subscribe(listener: () => void): () => void {
    return this.state.subscribe(listener);
  }

  setJson(json: QuestionJson): void {
    const result = validate(json);
    if (result.errors.length > 0) {
      throw new Error(
        `Invalid QuestionJson: ${result.errors.map((item) => item.message).join('; ')}`,
      );
    }
    this.commit(normalizeJson(json));
  }

  applyPatch(patch: QuestionPatch): void {
    const applied = applyQuestionPatch(this.state.getState().json, patch);
    const result = validate(applied.json);
    if (result.errors.length > 0) {
      throw new Error(
        `Patch produced invalid QuestionJson: ${result.errors.map((item) => item.message).join('; ')}`,
      );
    }
    this.commit(applied.json);
  }

  insertNode(
    type: string,
    parentId: string,
    afterId: string | null = null,
  ): WidgetNode {
    const definition = getWidgetDefinition(type);
    if (!definition) throw new Error(`Unknown widget type: ${type}`);

    const node: WidgetNode = {
      type,
      id: randomId(type.replaceAll('-', '_')),
      options: clone(definition.defaultOptions),
    };
    if (definition.componentType === 'CONTAINER') node.widgetList = [];

    if (definition.answerType && typeof node.options.name === 'string') {
      const names = new Set<string>();
      const visit = (nodes: WidgetNode[]) => {
        nodes.forEach((item) => {
          if (typeof item.options.name === 'string') names.add(item.options.name);
          if (item.widgetList) visit(item.widgetList);
        });
      };
      visit(this.state.getState().json.widgetList);

      const base = node.options.name;
      let index = 1;
      while (names.has(`${base}_${index}`)) index += 1;
      node.options.name = `${base}_${index}`;
    }

    const applied = applyQuestionPatch(this.state.getState().json, {
      summary: `新增${definition.displayName}`,
      ops: [{ op: 'insertChild', parentId, afterId, node }],
    });
    const result = validate(applied.json);
    if (result.errors.length > 0) {
      throw new Error(
        `Patch produced invalid QuestionJson: ${result.errors.map((item) => item.message).join('; ')}`,
      );
    }

    this.commit(applied.json);
    return clone(
      findNode(applied.json.widgetList, applied.idMap.get(node.id) ?? node.id) ??
        node,
    );
  }

  moveNode(nodeId: string, parentId: string, afterId: string | null): void {
    this.applyPatch({
      summary: '移动组件',
      ops: [{ op: 'move', targetId: nodeId, parentId, afterId }],
    });
  }

  updateOptions(nodeId: string, options: Record<string, JsonValue>): void {
    this.applyPatch({
      summary: '更新组件属性',
      ops: [{ op: 'updateOptions', targetId: nodeId, options }],
    });
  }

  removeNode(nodeId: string): void {
    this.applyPatch({
      summary: '删除组件',
      ops: [{ op: 'remove', targetId: nodeId }],
    });
  }

  validate(): ValidationResult {
    return validate(this.state.getState().json);
  }

  canUndo(): boolean {
    return this.cursor > 0;
  }

  canRedo(): boolean {
    return this.cursor < this.history.length - 1;
  }

  undo(): boolean {
    if (!this.canUndo()) return false;
    this.cursor -= 1;
    this.state.setState({ json: clone(this.history[this.cursor]!) });
    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) return false;
    this.cursor += 1;
    this.state.setState({ json: clone(this.history[this.cursor]!) });
    return true;
  }

  private commit(next: QuestionJson): void {
    this.state.setState({ json: clone(next) });
    this.history = this.history.slice(0, this.cursor + 1);
    this.history.push(clone(next));
    if (this.history.length > 31) this.history.shift();
    this.cursor = this.history.length - 1;
  }
}

export function createDesignerStore(initial?: QuestionJson): DesignerStore {
  return new DesignerStoreImpl(initial);
}
