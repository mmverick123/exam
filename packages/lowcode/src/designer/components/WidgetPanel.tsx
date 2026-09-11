import React from 'react';

import { widgetDefinitions } from '../../contract';

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
              <button
                type="button"
                key={definition.type}
                draggable
                data-widget-type={definition.type}
                onDragStart={(event) => event.dataTransfer.setData('application/x-exam-widget', definition.type)}
                onClick={() => onAdd?.(definition.type)}
              >
                {definition.displayName}
              </button>
            ))}
        </section>
      ))}
    </aside>
  );
}
