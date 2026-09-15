import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { CONTRACT_VERSION, outlineForAgent, type QuestionJson, type QuestionPatch } from '@exam/lowcode/contract';
import { QuestionDesigner, createDesignerStore, type DesignerStore } from '@exam/lowcode/designer';
import { api, platformToken } from '../services/api';

interface Detail { id: number; name: string; currentVersion: number; publishedVersion: number; formJson: QuestionJson; }

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  try {
    const payload = JSON.parse(raw) as { error?: string; message?: string };
    if (payload.message) return payload.message;
    if (payload.error) return payload.error;
  } catch { /* keep the original response when it is not JSON */ }
  return raw.replace(/^Error:\s*/, '');
}

export function DesignPage({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [message, setMessage] = useState('');
  const [publishError, setPublishError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatLog, setChatLog] = useState<string[]>([]);
  const [pendingPatch, setPendingPatch] = useState<QuestionPatch | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [rightPanel, setRightPanel] = useState<'settings' | 'agent'>('settings');
  const abortRef = useRef<AbortController | null>(null);
  const storeRef = useRef<DesignerStore | null>(null);
  useEffect(() => { void api<Detail>(`/api/question-types/${id}`).then((value) => { storeRef.current = createDesignerStore(value.formJson); setDetail(value); }); }, [id]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (!publishError) return;
    const timer = window.setTimeout(() => setPublishError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [publishError]);
  if (!detail || !storeRef.current) return <main className="platform-page">加载中…</main>;
  const store = storeRef.current;
  const save = async () => {
    const saved = await api<{ version: number }>(`/api/question-types/${id}/versions`, { method: 'POST', body: JSON.stringify({ formJson: store.getJson() }) });
    setDetail({ ...detail, currentVersion: saved.version }); setMessage(`已保存 v${saved.version}`);
  };
  const publish = async () => {
    setPublishError(null);
    try { await api(`/api/question-types/${id}/publish`, { method: 'POST', body: JSON.stringify({ version: detail.currentVersion }) }); setDetail({ ...detail, publishedVersion: detail.currentVersion }); setMessage('发布成功'); }
    catch (error) { setMessage(''); setPublishError(`发布失败：${errorMessage(error)}`); }
  };
  const cancelChat = () => { abortRef.current?.abort(); abortRef.current = null; setChatBusy(false); setChatLog((items) => [...items, '已取消']); };
  const sendChat = async () => {
    if (!chatInput.trim() || chatBusy) return;
    const text = chatInput.trim(); setChatInput(''); setChatBusy(true); setPendingPatch(null); setChatLog((items) => [...items, `你：${text}`]);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await fetch('/api/agent/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${platformToken}` }, body: JSON.stringify({ sessionId: `design-${id}`, message: text, contractVersion: CONTRACT_VERSION, questionOutline: outlineForAgent(store.getJson()) }), signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(await response.text());
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true });
        const frames = buffer.split('\n\n'); buffer = frames.pop() ?? '';
        for (const frame of frames) {
          if (frame.startsWith(':')) continue;
          const event = frame.match(/^event:\s*(\w+)\ndata:\s*(.+)$/s); if (!event) continue;
          const data = JSON.parse(event[2]) as Record<string, unknown>;
          if (event[1] === 'plan') setChatLog((items) => [...items, `规划：${(data.steps as string[] | undefined)?.join('；') ?? ''}`]);
          else if (event[1] === 'message') setChatLog((items) => [...items, String(data.delta ?? '')]);
          else if (event[1] === 'patch') setPendingPatch({ summary: String(data.summary ?? ''), ops: (data.ops ?? []) as QuestionPatch['ops'] });
          else if (event[1] === 'validation') setChatLog((items) => [...items, `校验提示：${JSON.stringify(data.warnings)}`]);
          else if (event[1] === 'error') setChatLog((items) => [...items, `错误：${String(data.message ?? data.code)}`]);
        }
      }
    } catch (error) { if ((error as Error).name !== 'AbortError') setChatLog((items) => [...items, `请求失败：${String((error as Error).message ?? error)}`]); }
    finally { abortRef.current = null; setChatBusy(false); }
  };
  const applyPending = () => { if (!pendingPatch) return; try { store.applyPatch(pendingPatch); setPendingPatch(null); setChatLog((items) => [...items, '补丁已应用（可使用一次撤销完整回退）']); } catch (error) { setChatLog((items) => [...items, `应用失败：${String(error)}`]); } };
  return (
    <div className="design-page">
      {publishError ? <div className="design-toast is-error" role="alert"><span className="design-toast-icon">!</span><span>{publishError}</span><button type="button" aria-label="关闭提示" onClick={() => setPublishError(null)}>×</button></div> : null}
      <header className="design-app-header">
        <div className="design-title-group">
          <Link className="design-back" to="/admin/question-types" aria-label="返回题型列表">←</Link>
          <div className="design-brand-mark">E</div>
          <div>
            <div className="design-eyebrow">EXAM STUDIO · 题型设计器</div>
            <h1>{detail.name}</h1>
          </div>
          <span className={`design-status${detail.currentVersion > detail.publishedVersion ? ' is-draft' : ''}`}>
            {detail.currentVersion > detail.publishedVersion ? '草稿有改动' : '已同步'}
          </span>
        </div>
        <div className="page-actions">
          <span className="design-version">v{detail.currentVersion}</span>
          {message ? <span className="design-message" role="status">{message}</span> : null}
          <button className="button-secondary" type="button" onClick={() => void save()}>保存草稿</button>
          <button className="button-primary" type="button" onClick={() => void publish()}>发布当前版本</button>
        </div>
      </header>
      {detail.formJson.contractVersion !== CONTRACT_VERSION ? <div className="version-banner">该题型基于契约 v{detail.formJson.contractVersion}，当前设计器为 v{CONTRACT_VERSION}</div> : null}
      <section className={`design-workspace${rightPanel === 'agent' ? ' is-agent-mode' : ''}`}>
        <QuestionDesigner store={store} />
        <div className="design-rail-tabs" role="tablist" aria-label="右侧面板">
          <button type="button" role="tab" aria-selected={rightPanel === 'settings'} className={rightPanel === 'settings' ? 'is-active' : ''} onClick={() => setRightPanel('settings')}>组件设置</button>
          <button type="button" role="tab" aria-selected={rightPanel === 'agent'} className={rightPanel === 'agent' ? 'is-active' : ''} onClick={() => setRightPanel('agent')}>AI 助手{pendingPatch ? <span className="notification-dot" /> : null}</button>
        </div>
        <aside className="agent-chat-drawer" aria-label="AI 助手">
          <div className="agent-chat-header">
            <div className="agent-avatar">✦</div>
            <div><h2>AI 题型助手</h2><p>描述你的需求，我来调整画布</p></div>
          </div>
          <div className={`agent-chat-log${chatLog.length === 0 ? ' is-empty' : ''}`}>
            {chatLog.length === 0 ? <div className="agent-empty-state"><span>✦</span><strong>从一句话开始设计</strong><p>试试“创建一道关于光合作用的单选题，包含 4 个选项”</p></div> : chatLog.map((item, index) => <div className={item.startsWith('你：') ? 'chat-message is-user' : 'chat-message'} key={`${index}-${item}`}>{item}</div>)}
          </div>
          {pendingPatch ? <div className="agent-patch-preview"><strong>补丁预览</strong><p>{pendingPatch.summary}</p><ol>{pendingPatch.ops.map((op, index) => <li key={index}>{op.op}{op.op === 'insertChild' ? ` → ${op.node.type}` : ` → ${op.targetId}`}</li>)}</ol><div><button className="button-primary" type="button" onClick={applyPending}>确认应用</button><button className="button-ghost" type="button" onClick={() => setPendingPatch(null)}>拒绝</button></div></div> : null}
          <div className="agent-composer">
            <textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendChat(); } }} placeholder="描述你想创建或修改的题型…" disabled={chatBusy} />
            <div className="agent-composer-footer"><span>Enter 发送 · Shift+Enter 换行</span><button className="agent-send" type="button" aria-label={chatBusy ? '取消生成' : '发送'} onClick={() => chatBusy ? cancelChat() : void sendChat()} disabled={!chatBusy && !chatInput.trim()}>{chatBusy ? '停止' : '↑'}</button></div>
          </div>
        </aside>
      </section>
    </div>
  );
}
