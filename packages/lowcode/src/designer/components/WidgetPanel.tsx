import React, { useRef } from 'react';

import { widgetDefinitions } from '../../contract';
import { useDraggable } from '@dnd-kit/core';

export interface WidgetPanelProps {
  onAdd?: (type: string) => void;
}

export function WidgetPanel({ onAdd }: WidgetPanelProps) {
  const groups = [
    { label: '容器', matches: (type: string, libraryGroup?: string) => type === 'CONTAINER' && !libraryGroup },
    { label: '展示', matches: (type: string, libraryGroup?: string) => type === 'DISPLAY_COMPONENT' && !libraryGroup },
    { label: '考试题目', matches: (type: string, libraryGroup?: string) => type === 'ANSWER_COMPONENT' && libraryGroup !== 'form' },
    { label: '问卷表单', matches: (type: string, libraryGroup?: string) => libraryGroup === 'form' },
  ] as const;
  return (
    <aside className="exam-widget-panel" aria-label="组件面板">
      {groups.map((group) => (
        <section key={group.label}>
          <h3>{group.label}</h3>
          {widgetDefinitions
            .filter((definition) => group.matches(definition.componentType, definition.libraryGroup) && !definition.internal)
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
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const dndPointerDown = listeners?.onPointerDown;
  return <button ref={setNodeRef} type="button" draggable={false} className={isDragging ? 'is-dragging' : undefined} {...listeners} {...attributes}
    onPointerDown={(event) => {
      pointerStart.current = { x: event.clientX, y: event.clientY };
      suppressClick.current = false;
      dndPointerDown?.(event);
    }}
    onClick={(event) => {
      const start = pointerStart.current;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) suppressClick.current = true;
      if (!suppressClick.current) onClick?.();
      pointerStart.current = null;
      suppressClick.current = false;
    }}
    >{children}</button>;
}
