import React from 'react';

import {
  formConfigSchema,
  getWidgetDefinition,
  type FormConfig,
  type JsonPrimitive,
  type JsonValue,
  type WidgetNode,
} from '../../contract';
import type { DesignerStore } from '../state/store';

function asString(value: JsonValue | undefined): string { return typeof value === 'string' ? value : ''; }
function newOptionValue(): string { return `opt_${Math.random().toString(36).slice(2, 10)}`; }

function FieldEditor({
  fieldKey: _fieldKey,
  schema,
  value,
  allOptions,
  onChange,
}: {
  fieldKey: string;
  schema: Record<string, unknown>;
  value: JsonValue | undefined;
  allOptions: Record<string, JsonValue>;
  onChange: (value: JsonValue) => void;
}) {
  const ui = schema['x-ui'] as { widget?: string; options?: Array<{ label: string; value: JsonPrimitive }>; optionsFrom?: string; multiple?: boolean } | undefined;
  const widget = ui?.widget ?? 'input';
  if (widget === 'hidden') return null;
  if (widget === 'switch') return <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />;
  if (widget === 'number') {
    return <input type="number" value={typeof value === 'number' ? value : ''} min={schema.minimum as number | undefined} max={schema.maximum as number | undefined} onChange={(event) => onChange(event.target.value === '' ? 0 : Number(event.target.value))} />;
  }
  if (widget === 'select' || widget === 'radio-group') {
    const options = ui?.options ?? [];
    return (
      <select value={String(value ?? '')} onChange={(event) => onChange(options.find((item) => String(item.value) === event.target.value)?.value ?? event.target.value)}>
        {options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
      </select>
    );
  }
  if (widget === 'answer-select') {
    const source = allOptions[ui?.optionsFrom ?? ''] as JsonValue;
    const options = Array.isArray(source) ? source.filter((item) => item && typeof item === 'object').map((item) => item as Record<string, JsonValue>) : [];
    if (ui?.multiple) {
      const selected = Array.isArray(value) ? value.map(String) : [];
      return <select multiple value={selected} onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((option) => option.value))}>{options.map((option) => <option key={String(option.value)} value={String(option.value)}>{String(option.label ?? option.value)}</option>)}</select>;
    }
    return <select value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}><option value="">未设置</option>{options.map((option) => <option key={String(option.value)} value={String(option.value)}>{String(option.label ?? option.value)}</option>)}</select>;
  }
  if (widget === 'option-editor') {
    const items = Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') as Array<Record<string, JsonValue>> : [];
    return (
      <div className="exam-option-editor">
        {items.map((item, index) => (
          <div className="exam-option-row" key={String(item.value ?? index)}>
            <input value={asString(item.label)} onChange={(event) => onChange(items.map((current, currentIndex) => currentIndex === index ? { ...current, label: event.target.value } : current))} />
            <code>{String(item.value ?? '')}</code>
            <button type="button" onClick={() => onChange(items.filter((_, currentIndex) => currentIndex !== index))}>删除</button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...items, { label: `选项 ${items.length + 1}`, value: newOptionValue() }])}>添加选项</button>
      </div>
    );
  }
  if (widget === 'richtext' || widget === 'textarea') return <textarea value={asString(value)} rows={ui?.options ? undefined : 3} onChange={(event) => onChange(event.target.value)} />;
  return <input type={widget === 'url' ? 'url' : 'text'} value={asString(value)} onChange={(event) => onChange(event.target.value)} />;
}

export interface SettingPanelProps {
  store: DesignerStore;
  selectedNode: WidgetNode | null;
  onUpdated?: () => void;
}

export function SettingPanel({ store, selectedNode, onUpdated }: SettingPanelProps) {
  const schema = selectedNode ? getWidgetDefinition(selectedNode.type)?.optionsSchema : formConfigSchema;
  const values = selectedNode ? selectedNode.options : store.getJson().formConfig as unknown as Record<string, JsonValue>;
  if (!schema) return <aside className="exam-setting-panel" />;
  const properties = schema.properties ?? {};
  const update = (key: string, value: JsonValue) => {
    if (selectedNode) store.updateOptions(selectedNode.id, { [key]: value });
    else {
      const json = store.getJson();
      store.setJson({ ...json, formConfig: { ...json.formConfig, [key]: value } as FormConfig });
    }
    onUpdated?.();
  };
  return (
    <aside className="exam-setting-panel">
      <h3>{selectedNode ? (getWidgetDefinition(selectedNode.type)?.displayName ?? selectedNode.type) : '表单配置'}</h3>
      {Object.entries(properties).map(([key, fieldSchema]) => (
        <label key={key} className="exam-setting-field">
          <span>{key}</span>
          <FieldEditor fieldKey={key} schema={fieldSchema as Record<string, unknown>} value={values[key]} allOptions={values} onChange={(value) => update(key, value)} />
        </label>
      ))}
    </aside>
  );
}
