import React from 'react';

import type { ContainerProps } from '../../model/types';

export function PageContainer({ node, children }: ContainerProps) {
  return <div className="exam-page" data-widget-id={node.id}>{children}</div>;
}
