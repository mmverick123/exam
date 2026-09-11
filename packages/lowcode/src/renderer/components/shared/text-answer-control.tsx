import React from 'react';

import type { FieldProps } from '../../model/types';
import { FieldShell, isInteractive } from './field-shell';

export function TextAnswerControl({ node, mode, value, onChange, multiline }: FieldProps & { multiline: boolean }) {
  const common = {
    name: String(node.options.name ?? node.id),
    value: typeof value === 'string' ? value : '',
    disabled: !isInteractive(mode),
    placeholder: String(node.options.placeholder ?? ''),
    maxLength: typeof node.options.maxLength === 'number' ? node.options.maxLength : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange?.(event.target.value),
  };
  return (
    <FieldShell node={node}>
      {node.options.title ? <div className="exam-field-title">{String(node.options.title)}</div> : null}
      {multiline ? <textarea {...common} rows={Number(node.options.rows ?? 6)} /> : <input {...common} style={{ width: `${Number(node.options.width ?? 240)}px` }} />}
    </FieldShell>
  );
}
