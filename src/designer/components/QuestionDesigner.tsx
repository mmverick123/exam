import React, { useEffect, useMemo, useState } from 'react';

import type { QuestionJson, WidgetNode } from '../../contract';
import { WidgetPanel } from './WidgetPanel';
import { FormWidget } from './FormWidget';
import { SettingPanel } from './SettingPanel';
import { ToolbarPanel } from './ToolbarPanel';
import { createDesignerStore, type DesignerStore } from '../state/store';

export interface QuestionDesignerProps {
  json?: QuestionJson;
  store?: DesignerStore;
  onChange?: (json: QuestionJson) => void;
  className?: string;
}

export function QuestionDesigner({ json, store: externalStore, onChange, className }: QuestionDesignerProps) {
  const ownedStore = useMemo(() => externalStore ?? createDesignerStore(json), [externalStore]);
  const store = externalStore ?? ownedStore;
  const [, setVersion] = useState(0);
  useEffect(() => store.subscribe(() => setVersion((version) => version + 1)), [store]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedNode = selectedId ? findNode(store.getJson().widgetList, selectedId) : null;
  const emitChange = () => onChange?.(store.getJson());
  const addToRoot = (type: string) => {
    const pageId = store.getJson().widgetList[0]?.id;
    if (pageId) { store.insertNode(type, pageId); emitChange(); }
  };
  return (
    <div className={className ?? 'exam-question-designer'}>
      <ToolbarPanel store={store} onPreview={() => setSelectedId(null)} />
      <div className="exam-designer-body">
        <WidgetPanel onAdd={addToRoot} />
        <FormWidget store={store} selectedId={selectedId} onSelect={setSelectedId} />
        <SettingPanel store={store} selectedNode={selectedNode} onUpdated={emitChange} />
      </div>
    </div>
  );
}

function findNode(nodes: WidgetNode[], id: string): WidgetNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = node.widgetList && findNode(node.widgetList, id);
    if (child) return child;
  }
  return null;
}
