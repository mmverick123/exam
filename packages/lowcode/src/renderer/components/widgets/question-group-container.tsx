import React from 'react';

import type { ContainerProps } from '../../model/types';

export function QuestionGroupContainer({ node, children }: ContainerProps) {
  const indexedChildren = React.Children.map(children, (child, index) => (
    <div className="exam-question-group-item" data-index={index + 1}>
      {node.options.showIndex !== false ? <span className="exam-question-index">{index + 1}.</span> : null}
      {child}
    </div>
  ));
  return (
    <section className="exam-question-group" data-widget-id={node.id}>
      {node.options.title ? <h3>{String(node.options.title)}</h3> : null}
      <div className="exam-question-group-children" style={{ gap: `${Number(node.options.gap ?? 16)}px` }}>{indexedChildren}</div>
    </section>
  );
}
