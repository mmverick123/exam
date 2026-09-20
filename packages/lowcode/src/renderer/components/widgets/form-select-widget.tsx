import React from 'react';

import type { FieldProps } from '../../model/types';
import { FieldShell, isInteractive } from '../shared/field-shell';

export function FormSelectWidget({ node, mode, value, onChange }: FieldProps) {
  const items = Array.isArray(node.options.optionItems) ? node.options.optionItems : [];
  const current = typeof value === 'string' ? value : '';
  const interactive = isInteractive(mode);
  return (
    <FieldShell node={node}>
      {node.options.title ? <div className="exam-field-title">{String(node.options.title)}</div> : null}
      <select className="exam-form-control" name={String(node.options.name ?? node.id)} value={current} disabled={!interactive} style={{ width: `${Number(node.options.width ?? 280)}px` }} onChange={(event) => onChange?.(event.target.value || null)}>
        <option value="">{String(node.options.placeholder ?? '请选择')}</option>
        {items.map((item, index) => {
          if (!item || typeof item !== 'object') return null;
          const option = item as { label?: unknown; value?: unknown };
          return <option key={`${String(option.value ?? '')}-${index}`} value={String(option.value ?? '')}>{String(option.label ?? '')}</option>;
        })}
      </select>
    </FieldShell>
  );
}
