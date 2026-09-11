import React from 'react';

import type { FieldProps } from '../../model/types';
import { sanitizeHtml } from '../../security/sanitize';
import { classNames, FieldShell } from '../shared/field-shell';

export function StemWidget({ node, mode }: FieldProps) {
  const content = typeof node.options.content === 'string' ? node.options.content : '';
  return (
    <FieldShell node={node}>
      {node.options.title ? <div className="exam-field-title">{String(node.options.title)}</div> : null}
      <div className={classNames('exam-stem', `align-${String(node.options.align ?? 'left')}`)} data-mode={mode} dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />
    </FieldShell>
  );
}
