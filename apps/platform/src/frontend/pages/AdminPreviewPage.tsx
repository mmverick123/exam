import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { QuestionJson } from '@exam/lowcode/contract';
import { QuestionRenderer } from '@exam/lowcode/renderer';
import { api } from '../services/api';
export function AdminPreviewPage({ id }: { id: string }) { const [json, setJson] = useState<QuestionJson | null>(null); const [name, setName] = useState(''); useEffect(() => { void api<{ formJson: QuestionJson; name: string }>(`/api/question-types/${id}`).then((result) => { setJson(result.formJson); setName(result.name); }); }, [id]); if (!json) return <main className="platform-page">加载中…</main>; return <main className="platform-page"><Link to="/admin/question-types">← 返回题型管理</Link><h1>预览：{name}</h1><QuestionRenderer json={json} mode="answer" /></main>; }
