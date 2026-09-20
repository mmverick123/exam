import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CONTRACT_VERSION, DEFAULT_FORM_CONFIG, type QuestionJson } from '@exam/lowcode/contract';
import { QuestionDesigner, createDesignerStore } from '@exam/lowcode/designer';
import { api } from '../services/api';

export function QuestionTypeWizardPage() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => new URLSearchParams(window.location.search).get('name') ?? ''); const [store] = useState(() => createDesignerStore({ contractVersion: CONTRACT_VERSION, widgetList: [{ type: 'page', id: crypto.randomUUID(), options: {}, widgetList: [] }], formConfig: { ...DEFAULT_FORM_CONFIG } } as QuestionJson)); const [error, setError] = useState('');
  const save = async () => { try { const result = await api<{ id: number }>('/api/admin/question-types', { method: 'POST', body: JSON.stringify({ name, formJson: store.getJson() }) }); navigate(`/admin/question-types/${result.id}/preview`); } catch (err) { setError(String(err)); } };
  return <main className="platform-page"><Link to="/admin/question-types">← 返回题型管理</Link><h1>新增题型</h1><p className="page-lead">题型只负责低码结构和题目内容，保存后由项目配置可答权限。</p><section><label>题目名称<input value={name} onChange={(event) => setName(event.target.value)} /></label><QuestionDesigner store={store} />{error ? <p role="alert">{error}</p> : null}<button className="button-primary" disabled={!name.trim()} onClick={() => void save()}>保存题型</button></section></main>;
}
