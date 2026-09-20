import React, { useEffect, useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';

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
  const [activeDrag, setActiveDrag] = useState<{ kind: string; label: string } | null>(null);
  const [recentNodeId, setRecentNodeId] = useState<string | null>(null);
  const selectedNode = selectedId ? findNode(store.getJson().widgetList, selectedId) : null;
  const emitChange = () => onChange?.(store.getJson());
  const flashNode = (nodeId: string) => {
    setRecentNodeId(nodeId);
    window.setTimeout(() => setRecentNodeId((current) => current === nodeId ? null : current), 520);
  };
  const addToRoot = (type: string) => {
    const pageId = store.getJson().widgetList[0]?.id;
    if (pageId) { const inserted = store.insertNode(type, pageId); flashNode(inserted.id); emitChange(); }
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
  const handleDragStart = (event: DragStartEvent) => {
    const source = event.active.data.current as { kind?: string; type?: string; nodeId?: string } | undefined;
    const label = source?.kind === 'widget-type' && source.type
      ? (getWidgetDefinition(source.type)?.displayName ?? source.type)
      : source?.nodeId ? (findNode(store.getJson().widgetList, source.nodeId) && getWidgetDefinition(findNode(store.getJson().widgetList, source.nodeId)!.type)?.displayName) ?? '组件'
      : '组件';
    setActiveDrag({ kind: source?.kind ?? 'node', label });
  };
  const handleDragEnd = (event: DragEndEvent) => {
    const source = event.active.data.current as { kind?: string; type?: string; nodeId?: string } | undefined;
    const target = event.over?.data.current as { kind?: string; nodeId?: string } | undefined;
    try {
      if (source && target?.nodeId) {
        if (source.kind === 'widget-type' && source.type) { const d = findNode(store.getJson().widgetList, target.nodeId); if (d && d.widgetList !== undefined && getAllowed(d.type, source.type)) { const inserted = store.insertNode(source.type, target.nodeId); flashNode(inserted.id); emitChange(); } }
        else if (source.kind === 'node' && source.nodeId && source.nodeId !== target.nodeId) {
          if (target.kind === 'container') { store.moveNode(source.nodeId, target.nodeId, null); flashNode(source.nodeId); emitChange(); }
          else if (target.kind === 'sibling') { const location = findLocation(store.getJson().widgetList, target.nodeId); if (location) { store.moveNode(source.nodeId, location.parentId, target.nodeId); flashNode(source.nodeId); emitChange(); } }
        }
      }
    } catch { /* invalid drops are rejected by the Patch layer */ }
    setActiveDrag(null);
  };
  const handleDragCancel = () => setActiveDrag(null);
  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
    <div className={`${className ?? 'exam-question-designer'}${activeDrag ? ' is-dragging' : ''}`}>
      <ToolbarPanel store={store} onPreview={() => setSelectedId(null)} />
      <div className="exam-designer-body">
        <WidgetPanel onAdd={addToRoot} />
        <FormWidget store={store} selectedId={selectedId} onSelect={setSelectedId} recentNodeId={recentNodeId} />
        <SettingPanel store={store} selectedNode={selectedNode} onUpdated={emitChange} />
      </div>
    </div>
    <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
      {activeDrag ? <div className="exam-drag-overlay"><span>＋</span>{activeDrag.label}</div> : null}
    </DragOverlay>
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
