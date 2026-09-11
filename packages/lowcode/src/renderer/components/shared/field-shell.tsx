import React from 'react';

import type { WidgetNode } from '../../../contract';
import type { FieldProps } from '../../model/types';

export function classNames(...values: Array<string | false | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function isInteractive(mode: FieldProps['mode']): boolean {
  return mode === 'answer' || mode === 'preview';
}

export function FieldShell({ node, children }: { node: WidgetNode; children: React.ReactNode }) {
  return <div className="exam-field" data-widget-type={node.type} data-widget-id={node.id}>{children}</div>;
}
