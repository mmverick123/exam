import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';

import { containerComponents, fieldComponents } from '../../renderer';
import { getWidgetDefinition, isContainer, type WidgetNode } from '../../contract';
import type { DesignerStore } from '../state/store';
import { useDesignerSelector } from '../state/useDesignerSelector';

export interface FormWidgetProps {
  store: DesignerStore;
  /** @deprecated Selection is now read from the store by each node. */
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
  recentNodeId?: string | null | undefined;
}

interface DesignerNodeProps {
  store: DesignerStore;
  nodeId: string;
  recent: boolean;
  recentNodeId?: string | null | undefined;
  onSelect: (id: string | null) => void;
}

const DesignerNode = React.memo(function DesignerNode({ store, nodeId, recent, recentNodeId, onSelect }: DesignerNodeProps) {
  const node = useDesignerSelector(store, (state) => findNode(state.json.widgetList, nodeId));
  const selected = useDesignerSelector(store, (state) => state.selectedId === nodeId);
  if (!node) return null;
  const definition = getWidgetDefinition(node.type);
  const { attributes, listeners, setNodeRef: setDragRef, transform } = useDraggable({ id: `node:${node.id}`, data: { kind: 'node', nodeId: node.id } });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `drop:${node.id}`, data: { kind: isContainer(node.type) ? 'container' : 'sibling', nodeId: node.id } });
  const content = isContainer(node.type)
    ? (() => {
        const Container = containerComponents[node.type];
        if (!Container) return null;
        return (
          <Container node={node} mode="design">
            {(node.widgetList ?? []).map((child, index, children) => (
              <React.Fragment key={child.id}>
                <SiblingDropZone parentId={node.id} afterId={index > 0 ? children[index - 1]!.id : null} />
                <DesignerNode
                  nodeId={child.id}
                  store={store}
                  recent={recentNodeId === child.id}
                  recentNodeId={recentNodeId}
                  onSelect={onSelect}
                />
              </React.Fragment>
            ))}
            <SiblingDropZone parentId={node.id} afterId={node.widgetList?.at(-1)?.id ?? null} />
          </Container>
        );
      })()
    : (() => {
        const Field = fieldComponents[node.type];
        return Field ? <Field node={node} mode="design" value={null} /> : null;
      })();
  return (
    <div ref={(element) => { setDragRef(element); setDropRef(element); }} style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={`exam-designer-node${selected ? ' is-selected' : ''}${recent ? ' is-just-added' : ''}`}
      data-node-id={node.id} data-drop-over={isOver || undefined}
      {...listeners} {...attributes}
      onClick={(event) => { event.stopPropagation(); onSelect(node.id); }}
    >
      <div className="exam-designer-node-toolbar">
        <span>{definition?.displayName ?? node.type}</span>
        {!definition?.internal ? <button type="button" onClick={(event) => { event.stopPropagation(); store.removeNode(node.id); onSelect(null); }}>删除</button> : null}
      </div>
      {content}
    </div>
  );
}, (previous, next) => previous.store === next.store
  && previous.nodeId === next.nodeId
  && previous.recent === next.recent
  && previous.onSelect === next.onSelect);

function SiblingDropZone({ parentId, afterId }: { parentId: string; afterId: string | null }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-gap:${parentId}:${afterId ?? 'start'}`,
    data: { kind: 'sibling-gap', parentId, afterId },
  });
  return <div ref={setNodeRef} className="exam-designer-drop-gap" data-drop-over={isOver || undefined} aria-hidden="true" />;
}

export function FormWidget({ store, onSelect, recentNodeId }: FormWidgetProps) {
  const rootNodes = useDesignerSelector(store, (state) => state.json.widgetList);
  return (
    <main className="exam-form-widget" onClick={() => onSelect(null)}>
      {rootNodes.map((node) => (
        <DesignerNode
          key={node.id}
          nodeId={node.id}
          store={store}
          recent={recentNodeId === node.id}
          recentNodeId={recentNodeId}
          onSelect={onSelect}
        />
      ))}
    </main>
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
