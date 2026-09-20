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
  onPreview?: () => void;
  onImportJson?: () => void;
  onExportJson?: () => void;
}

export function QuestionDesigner({ json, store: externalStore, onChange, className, onPreview, onImportJson, onExportJson }: QuestionDesignerProps) {
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
    const target = event.over?.data.current as { kind?: string; nodeId?: string; parentId?: string; afterId?: string | null } | undefined;
    try {
      if (source && target) {
        if (source.kind === 'widget-type' && source.type) {
          if (target.kind === 'sibling-gap' && target.parentId) {
            const parent = findNode(store.getJson().widgetList, target.parentId);
            if (parent && getAllowed(parent.type, source.type)) {
              const inserted = store.insertNode(source.type, target.parentId, target.afterId ?? null);
              flashNode(inserted.id);
              emitChange();
            }
          } else if (target.nodeId) {
            const targetNode = findNode(store.getJson().widgetList, target.nodeId);
            if (targetNode && targetNode.widgetList !== undefined && getAllowed(targetNode.type, source.type)) {
              const inserted = store.insertNode(source.type, target.nodeId);
              flashNode(inserted.id);
              emitChange();
            } else if (target.kind === 'sibling') {
              const location = findLocation(store.getJson().widgetList, target.nodeId);
              const parent = location ? findNode(store.getJson().widgetList, location.parentId) : null;
              if (location && parent && getAllowed(parent.type, source.type)) {
                const inserted = store.insertNode(source.type, location.parentId, target.nodeId);
                flashNode(inserted.id);
                emitChange();
              }
            }
          }
        }
        else if (source.kind === 'node' && source.nodeId) {
          if (target.kind === 'sibling-gap' && target.parentId) {
            if (source.nodeId !== target.afterId) { store.moveNode(source.nodeId, target.parentId, target.afterId ?? null); flashNode(source.nodeId); emitChange(); }
          } else if (target.nodeId && source.nodeId !== target.nodeId) {
            if (target.kind === 'container') { store.moveNode(source.nodeId, target.nodeId, null); flashNode(source.nodeId); emitChange(); }
            else if (target.kind === 'sibling') { const location = findLocation(store.getJson().widgetList, target.nodeId); if (location) { store.moveNode(source.nodeId, location.parentId, target.nodeId); flashNode(source.nodeId); emitChange(); } }
          }
        }
      }
    } catch { /* invalid drops are rejected by the Patch layer */ }
    setActiveDrag(null);
  };
  const handleDragCancel = () => setActiveDrag(null);
  const exportJson = () => {
    const text = JSON.stringify(store.getJson(), null, 2);
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'question-type.json';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
    <div className={`${className ?? 'exam-question-designer'}${activeDrag ? ' is-dragging' : ''}`}>
      <ToolbarPanel
        store={store}
        onPreview={() => { setSelectedId(null); onPreview?.(); }}
        {...(onImportJson ? { onImportJson } : {})}
        onExportJson={onExportJson ?? exportJson}
      />
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
