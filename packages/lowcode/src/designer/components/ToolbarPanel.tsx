import React from 'react';

import type { DesignerStore } from '../state/store';

export function ToolbarPanel({ store, onPreview, onImportJson, onExportJson }: { store: DesignerStore; onPreview?: () => void; onImportJson?: () => void; onExportJson?: () => void }) {
  return (
    <header className="exam-toolbar-panel">
      <button type="button" disabled={!store.canUndo()} onClick={() => store.undo()}>撤销</button>
      <button type="button" disabled={!store.canRedo()} onClick={() => store.redo()}>重做</button>
      <button type="button" onClick={onPreview}>预览</button>
      {onImportJson ? <button type="button" onClick={onImportJson}>导入 JSON</button> : null}
      <button type="button" onClick={onExportJson}>导出 JSON</button>
      <button type="button" onClick={() => { if (window.confirm('确定清空画布吗？')) store.setJson({ ...store.getJson(), widgetList: [{ ...store.getJson().widgetList[0]!, widgetList: [] }] }); }}>清空</button>
    </header>
  );
}
