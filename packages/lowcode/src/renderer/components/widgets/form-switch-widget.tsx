import React from 'react';

import type { FieldProps } from '../../model/types';
import { FieldShell, isInteractive } from '../shared/field-shell';

export function FormSwitchWidget({ node, mode, value, onChange }: FieldProps) {
  const checked = value === true;
  const interactive = isInteractive(mode);
  return (
    <FieldShell node={node}>
      {node.options.title ? <div className="exam-field-title">{String(node.options.title)}</div> : null}
      <label className="exam-switch-control">
        <input type="checkbox" name={String(node.options.name ?? node.id)} checked={checked} disabled={!interactive} onChange={(event) => onChange?.(event.target.checked)} />
        <span className="exam-switch-track" aria-hidden="true"><span /></span>
        <span className="exam-switch-label">{String(checked ? node.options.activeLabel ?? '是' : node.options.inactiveLabel ?? '否')}</span>
      </label>
    </FieldShell>
  );
}
