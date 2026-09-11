import React from 'react';

import type { DesignerStore } from '../state/store';

export function ToolbarPanel({ store, onPreview }: { store: DesignerStore; onPreview?: () => void }) {
  return (
    <header className="exam-toolbar-panel">
      <button type="button" disabled={!store.canUndo()} onClick={() => store.undo()}>撤销</button>
      <button type="button" disabled={!store.canRedo()} onClick={() => store.redo()}>重做</button>
      <button type="button" onClick={onPreview}>预览</button>
      <button type="button" onClick={() => navigator.clipboard?.writeText(JSON.stringify(store.getJson(), null, 2))}>导出 JSON</button>
      <button type="button" onClick={() => { if (window.confirm('确定清空画布吗？')) store.setJson({ ...store.getJson(), widgetList: [{ ...store.getJson().widgetList[0]!, widgetList: [] }] }); }}>清空</button>
    </header>
  );
}
