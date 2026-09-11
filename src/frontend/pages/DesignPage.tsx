import React, { useEffect, useRef, useState } from 'react';

import { CONTRACT_VERSION, outlineForAgent, type QuestionJson, type QuestionPatch } from '@exam/lowcode/contract';
import { QuestionDesigner, createDesignerStore, type DesignerStore } from '@exam/lowcode/designer';
import { api } from '../services/api';

interface Detail { id: number; name: string; currentVersion: number; publishedVersion: number; formJson: QuestionJson; }

export function DesignPage({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [message, setMessage] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatLog, setChatLog] = useState<string[]>([]);
  const [pendingPatch, setPendingPatch] = useState<QuestionPatch | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const storeRef = useRef<DesignerStore | null>(null);
  useEffect(() => { void api<Detail>(`/api/question-types/${id}`).then((value) => { storeRef.current = createDesignerStore(value.formJson); setDetail(value); }); }, [id]);
  useEffect(() => () => abortRef.current?.abort(), []);
  if (!detail || !storeRef.current) return <main className="platform-page">加载中…</main>;
  const store = storeRef.current;
  const save = async () => {
    const saved = await api<{ version: number }>(`/api/question-types/${id}/versions`, { method: 'POST', body: JSON.stringify({ formJson: store.getJson() }) });
    setDetail({ ...detail, currentVersion: saved.version }); setMessage(`已保存 v${saved.version}`);
  };
  const publish = async () => {
    try { await api(`/api/question-types/${id}/publish`, { method: 'POST', body: JSON.stringify({ version: detail.currentVersion }) }); setDetail({ ...detail, publishedVersion: detail.currentVersion }); setMessage('发布成功'); }
    catch (error) { setMessage(`发布失败：${String(error)}`); }
  };
  const cancelChat = () => { abortRef.current?.abort(); abortRef.current = null; setChatBusy(false); setChatLog((items) => [...items, '已取消']); };
  const sendChat = async () => {
    if (!chatInput.trim() || chatBusy) return;
    const text = chatInput.trim(); setChatInput(''); setChatBusy(true); setPendingPatch(null); setChatLog((items) => [...items, `你：${text}`]);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await fetch('/api/agent/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-token' }, body: JSON.stringify({ sessionId: `design-${id}`, message: text, contractVersion: CONTRACT_VERSION, questionOutline: outlineForAgent(store.getJson()) }), signal: controller.signal });
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
    <main className="platform-page">
      <nav><a href="/question-types">返回列表</a></nav>
      <h1>{detail.name}</h1>
      {detail.formJson.contractVersion !== CONTRACT_VERSION ? <div className="version-banner">该题型基于契约 v{detail.formJson.contractVersion}，当前设计器为 v{CONTRACT_VERSION}</div> : null}
      {detail.currentVersion > detail.publishedVersion ? <div className="draft-banner">有未发布改动</div> : null}
      <div className="page-actions"><button type="button" onClick={() => void save()}>保存</button><button type="button" onClick={() => void publish()}>发布当前版本</button><span>{message}</span></div>
      <QuestionDesigner store={store} />
      <aside className="agent-chat-drawer">
        <h2>Agent 助手</h2>
        <div className="agent-chat-log">{chatLog.map((item, index) => <div key={`${index}-${item}`}>{item}</div>)}</div>
        {pendingPatch ? <div className="agent-patch-preview"><strong>补丁预览：</strong> {pendingPatch.summary}<ol>{pendingPatch.ops.map((op, index) => <li key={index}>{op.op}{op.op === 'insertChild' ? ` → ${op.node.type}` : op.op === 'updateOptions' ? ` → ${op.targetId}` : op.op === 'remove' ? ` → ${op.targetId}` : ` → ${op.targetId}`}</li>)}</ol><button type="button" onClick={applyPending}>确认应用</button><button type="button" onClick={() => setPendingPatch(null)}>拒绝</button></div> : null}
        <textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="例如：把第二小问改成多选并加一个选项" disabled={chatBusy} />
        <div><button type="button" onClick={() => void sendChat()} disabled={chatBusy || !chatInput.trim()}>发送</button>{chatBusy ? <button type="button" onClick={cancelChat}>取消</button> : null}</div>
      </aside>
    </main>
  );
}
