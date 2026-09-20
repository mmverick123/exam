import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CONTRACT_VERSION, DEFAULT_FORM_CONFIG, type QuestionJson } from '@exam/lowcode/contract';
import { QuestionDesigner, createDesignerStore } from '@exam/lowcode/designer';
import { QuestionRenderer } from '@exam/lowcode/renderer';
import { api } from '../services/api';

export function QuestionTypeWizardPage() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => new URLSearchParams(window.location.search).get('name') ?? ''); const [store] = useState(() => createDesignerStore({ contractVersion: CONTRACT_VERSION, widgetList: [{ type: 'page', id: crypto.randomUUID(), options: {}, widgetList: [] }], formConfig: { ...DEFAULT_FORM_CONFIG } } as QuestionJson)); const [error, setError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false); const [importOpen, setImportOpen] = useState(false); const [jsonDraft, setJsonDraft] = useState(''); const [importError, setImportError] = useState(''); const [exportOpen, setExportOpen] = useState(false); const [exportDraft, setExportDraft] = useState(''); const [copyStatus, setCopyStatus] = useState('');
  const save = async () => { try { const result = await api<{ id: number }>('/api/admin/question-types', { method: 'POST', body: JSON.stringify({ name, formJson: store.getJson() }) }); navigate(`/admin/question-types/${result.id}/preview`); } catch (err) { setError(String(err)); } };
  const openImport = () => { setJsonDraft(JSON.stringify(store.getJson(), null, 2)); setImportError(''); setImportOpen(true); };
  const openExport = () => { setExportDraft(JSON.stringify(store.getJson(), null, 2)); setCopyStatus(''); setExportOpen(true); };
  const copyCurrentJson = async () => {
    try {
      await navigator.clipboard.writeText(exportDraft);
      setCopyStatus('已复制');
    } catch {
      setCopyStatus('复制失败，请手动复制文本');
    }
  };
  const downloadCurrentJson = () => {
    const url = URL.createObjectURL(new Blob([exportDraft], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'question-type.json';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const applyImport = () => {
    try {
      const next = JSON.parse(jsonDraft) as QuestionJson;
      store.setJson(next);
      setImportOpen(false);
      setImportError('');
    } catch (err) { setImportError(err instanceof Error ? err.message : String(err)); }
  };
  return <main className="platform-page"><Link to="/admin/question-types">← 返回题型管理</Link><h1>新增题型</h1><p className="page-lead">题型只负责低码结构和题目内容，保存后由项目配置可答权限。</p><section><label>题目名称<input value={name} onChange={(event) => setName(event.target.value)} /></label><QuestionDesigner store={store} onPreview={() => setPreviewOpen(true)} onImportJson={openImport} onExportJson={openExport} />{error ? <p role="alert">{error}</p> : null}<button className="button-primary" disabled={!name.trim()} onClick={() => void save()}>保存题型</button></section>{previewOpen ? <div className="question-type-modal" role="dialog" aria-modal="true" aria-labelledby="question-preview-title"><div className="question-type-modal-card"><header><div><span className="catalog-kicker">PREVIEW</span><h2 id="question-preview-title">题型预览</h2></div><button type="button" className="modal-close" aria-label="关闭预览" onClick={() => setPreviewOpen(false)}>×</button></header><div className="question-type-preview"><QuestionRenderer json={store.getJson()} mode="preview" /></div></div></div> : null}{importOpen ? <div className="question-type-modal" role="dialog" aria-modal="true" aria-labelledby="question-import-title"><div className="question-type-modal-card question-type-import-card"><header><div><span className="catalog-kicker">JSON</span><h2 id="question-import-title">导入题型 JSON</h2></div><button type="button" className="modal-close" aria-label="关闭导入" onClick={() => setImportOpen(false)}>×</button></header><p className="muted">粘贴完整 QuestionJson，确认后将覆盖当前画布。</p><textarea value={jsonDraft} onChange={(event) => setJsonDraft(event.target.value)} spellCheck={false} aria-label="题型 JSON" />{importError ? <p className="page-error" role="alert">导入失败：{importError}</p> : null}<footer><button type="button" className="button-secondary" onClick={() => setImportOpen(false)}>取消</button><button type="button" className="button-primary" onClick={applyImport}>覆盖当前画布</button></footer></div></div> : null}{exportOpen ? <div className="question-type-modal" role="dialog" aria-modal="true" aria-labelledby="question-export-title"><div className="question-type-modal-card question-type-import-card"><header><div><span className="catalog-kicker">JSON</span><h2 id="question-export-title">导出题型 JSON</h2></div><button type="button" className="modal-close" aria-label="关闭导出" onClick={() => setExportOpen(false)}>×</button></header><p className="muted">当前画布的 QuestionJson，可复制或下载保存。</p><textarea value={exportDraft} readOnly spellCheck={false} aria-label="当前题型 JSON" />{copyStatus ? <p className="muted question-type-copy-status" role="status">{copyStatus}</p> : null}<footer><button type="button" className="button-secondary" onClick={() => void copyCurrentJson()}>复制当前 JSON</button><button type="button" className="button-primary" onClick={downloadCurrentJson}>下载当前 JSON</button></footer></div></div> : null}</main>;
}
