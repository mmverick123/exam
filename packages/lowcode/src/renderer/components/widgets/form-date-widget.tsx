import React from 'react';

import type { FieldProps } from '../../model/types';
import { FieldShell, isInteractive } from '../shared/field-shell';

export function FormDateWidget({ node, mode, value, onChange }: FieldProps) {
  return (
    <FieldShell node={node}>
      {node.options.title ? <div className="exam-field-title">{String(node.options.title)}</div> : null}
      <input className="exam-form-control" type="date" name={String(node.options.name ?? node.id)} value={typeof value === 'string' ? value : ''} disabled={!isInteractive(mode)} aria-label={String(node.options.placeholder ?? '请选择日期')} style={{ width: `${Number(node.options.width ?? 220)}px` }} onChange={(event) => onChange?.(event.target.value || null)} />
    </FieldShell>
  );
}
