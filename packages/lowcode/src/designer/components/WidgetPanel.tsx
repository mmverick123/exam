import React from 'react';

import { widgetDefinitions } from '../../contract';
import { useDraggable } from '@dnd-kit/core';

export interface WidgetPanelProps {
  onAdd?: (type: string) => void;
}

export function WidgetPanel({ onAdd }: WidgetPanelProps) {
  const groups = [
    ['CONTAINER', '容器'],
    ['DISPLAY_COMPONENT', '展示'],
    ['ANSWER_COMPONENT', '答案'],
  ] as const;
  return (
    <aside className="exam-widget-panel" aria-label="组件面板">
      {groups.map(([componentType, label]) => (
        <section key={componentType}>
          <h3>{label}</h3>
          {widgetDefinitions
            .filter((definition) => definition.componentType === componentType && !definition.internal)
            .map((definition) => (
              <DraggableWidget key={definition.type} type={definition.type} onClick={() => onAdd?.(definition.type)}>{definition.displayName}</DraggableWidget>
            ))}
        </section>
      ))}
    </aside>
  );
}

function DraggableWidget({ type, children, onClick }: { type: string; children: React.ReactNode; onClick?: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `widget-type:${type}`, data: { kind: 'widget-type', type } });
  return <button ref={setNodeRef} type="button" draggable={false} className={isDragging ? 'is-dragging' : undefined} onClick={onClick} {...listeners} {...attributes}>{children}</button>;
}
