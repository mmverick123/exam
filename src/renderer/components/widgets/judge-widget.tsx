import React from 'react';

import type { FieldProps } from '../../model/types';
import { classNames, FieldShell, isInteractive } from '../shared/field-shell';

export function JudgeWidget({ node, mode, value, onChange }: FieldProps) {
  const interactive = isInteractive(mode);
  const current = typeof value === 'boolean' ? value : null;
  return (
    <FieldShell node={node}>
      {node.options.title ? <div className="exam-field-title">{String(node.options.title)}</div> : null}
      <div className={classNames('exam-judge-list', `layout-${String(node.options.optionsLayout ?? 'horizontal')}`)}>
        {[true, false].map((answer) => (
          <label className="exam-choice" key={String(answer)}>
            <input type="radio" name={String(node.options.name ?? node.id)} checked={current === answer} disabled={!interactive} onChange={() => interactive && onChange?.(answer)} />
            <span>{String(answer ? node.options.trueLabel ?? '正确' : node.options.falseLabel ?? '错误')}</span>
          </label>
        ))}
      </div>
    </FieldShell>
  );
}
