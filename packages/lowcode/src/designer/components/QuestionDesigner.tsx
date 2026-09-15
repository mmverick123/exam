import React, { useEffect, useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';

import { getWidgetDefinition, type QuestionJson, type WidgetNode } from '../../contract';
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
  const handleDragEnd = (event: DragEndEvent) => {
    const source = event.active.data.current as { kind?: string; type?: string; nodeId?: string } | undefined;
    const target = event.over?.data.current as { kind?: string; nodeId?: string } | undefined;
    if (!source || !target?.nodeId) return;
    try {
      if (source.kind === 'widget-type' && source.type) { const d = findNode(store.getJson().widgetList, target.nodeId); if (d && d.widgetList !== undefined && getAllowed(d.type, source.type)) { store.insertNode(source.type, target.nodeId); emitChange(); } }
      else if (source.kind === 'node' && source.nodeId && source.nodeId !== target.nodeId) {
        if (target.kind === 'container') { store.moveNode(source.nodeId, target.nodeId, null); emitChange(); }
        else if (target.kind === 'sibling') { const location = findLocation(store.getJson().widgetList, target.nodeId); if (location) { store.moveNode(source.nodeId, location.parentId, target.nodeId); emitChange(); } }
      }
    } catch { /* invalid drops are rejected by the Patch layer */ }
  };
  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
    <div className={className ?? 'exam-question-designer'}>
      <ToolbarPanel store={store} onPreview={() => setSelectedId(null)} />
      <div className="exam-designer-body">
        <WidgetPanel onAdd={addToRoot} />
        <FormWidget store={store} selectedId={selectedId} onSelect={setSelectedId} />
        <SettingPanel store={store} selectedNode={selectedNode} onUpdated={emitChange} />
      </div>
    </div>
    <DragOverlay>{null}</DragOverlay>
    </DndContext>
  );
}

function getAllowed(type: string, child: string): boolean { return Boolean((getWidgetDefinition(type)?.allowedChildTypes ?? []).includes(child)); }

function findNode(nodes: WidgetNode[], id: string): WidgetNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = node.widgetList && findNode(node.widgetList, id);
    if (child) return child;
  }
  return null;
}

function findLocation(nodes: WidgetNode[], id: string, parentId?: string): { parentId: string } | null {
  for (const node of nodes) {
    if (node.id === id && parentId) return { parentId };
    if (node.widgetList) { const found = findLocation(node.widgetList, id, node.id); if (found) return found; }
  }
  return null;
}
