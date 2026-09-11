import React from 'react';

import { containerComponents, fieldComponents } from '../../renderer';
import { getWidgetDefinition, isContainer, type WidgetNode } from '../../contract';
import type { DesignerStore } from '../state/store';

export interface FormWidgetProps {
  store: DesignerStore;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function DesignerNode({ node, store, selectedId, onSelect }: FormWidgetProps & { node: WidgetNode }) {
  const selected = selectedId === node.id;
  const definition = getWidgetDefinition(node.type);
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/x-exam-widget');
    if (!type || !definition?.allowedChildTypes?.includes(type)) return;
    store.insertNode(type, node.id, null);
  };
  const content = isContainer(node.type)
    ? (() => {
        const Container = containerComponents[node.type];
        if (!Container) return null;
        return (
          <Container node={node} mode="design">
            {(node.widgetList ?? []).map((child) => (
              <DesignerNode key={child.id} node={child} store={store} selectedId={selectedId} onSelect={onSelect} />
            ))}
          </Container>
        );
      })()
    : (() => {
        const Field = fieldComponents[node.type];
        return Field ? <Field node={node} mode="design" value={null} /> : null;
      })();
  return (
    <div
      className={`exam-designer-node${selected ? ' is-selected' : ''}`}
      data-node-id={node.id}
      onClick={(event) => { event.stopPropagation(); onSelect(node.id); }}
      onDragOver={(event) => {
        if (isContainer(node.type)) event.preventDefault();
      }}
      onDrop={handleDrop}
    >
      <div className="exam-designer-node-toolbar">
        <span>{definition?.displayName ?? node.type}</span>
        {!definition?.internal ? <button type="button" onClick={(event) => { event.stopPropagation(); store.removeNode(node.id); onSelect(null); }}>删除</button> : null}
      </div>
      {content}
    </div>
  );
}

export function FormWidget({ store, selectedId, onSelect }: FormWidgetProps) {
  const json = store.getJson();
  return (
    <main className="exam-form-widget" onClick={() => onSelect(null)}>
      {json.widgetList.map((node) => <DesignerNode key={node.id} node={node} store={store} selectedId={selectedId} onSelect={onSelect} />)}
    </main>
  );
}
