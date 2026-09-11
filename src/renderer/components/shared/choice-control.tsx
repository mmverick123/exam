import React from 'react';

import type { FieldProps } from '../../model/types';
import { classNames, FieldShell, isInteractive } from './field-shell';

export function ChoiceControl({ node, mode, value, onChange, multiple }: FieldProps & { multiple: boolean }) {
  const items = Array.isArray(node.options.optionItems) ? node.options.optionItems : [];
  const selected = multiple ? (Array.isArray(value) ? value : []) : value;
  if (mode === 'design' && items.length === 0) return <div className="exam-choice-placeholder">添加选项后在此显示选项</div>;
  return (
    <FieldShell node={node}>
      {node.options.title ? <div className="exam-field-title">{String(node.options.title)}</div> : null}
      <div className={classNames('exam-choice-list', `layout-${String(node.options.optionsLayout ?? 'vertical')}`)}>
        {items.map((item, index) => {
          if (!item || typeof item !== 'object') return null;
          const option = item as { label?: unknown; value?: unknown };
          const optionValue = String(option.value ?? '');
          const checked = multiple ? (selected as unknown[]).includes(optionValue) : selected === optionValue;
          const handleChange = () => {
            if (!isInteractive(mode) || !onChange) return;
            if (!multiple) return onChange(optionValue);
            const current = Array.isArray(selected) ? selected.map(String) : [];
            onChange(checked ? current.filter((itemValue) => itemValue !== optionValue) : [...current, optionValue]);
          };
          return (
            <label className="exam-choice" key={`${optionValue}-${index}`}>
              <input type={multiple ? 'checkbox' : 'radio'} name={String(node.options.name ?? node.id)} value={optionValue} checked={checked} disabled={!isInteractive(mode)} onChange={handleChange} />
              <span>{String(option.label ?? '')}</span>
            </label>
          );
        })}
      </div>
    </FieldShell>
  );
}
