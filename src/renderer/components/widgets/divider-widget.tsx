import React from 'react';

import type { FieldProps } from '../../model/types';
import { classNames, FieldShell } from '../shared/field-shell';

export function DividerWidget({ node }: FieldProps) {
  return (
    <FieldShell node={node}>
      <div className={classNames('exam-divider', node.options.dashed ? 'is-dashed' : undefined)} style={{ marginBlock: `${Number(node.options.marginY ?? 12)}px` }}>
        {node.options.title ? <span>{String(node.options.title)}</span> : null}
      </div>
    </FieldShell>
  );
}
