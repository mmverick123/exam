import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { CONTRACT_VERSION, outlineForAgent, type QuestionJson, type QuestionPatch } from '@exam/lowcode/contract';
import { QuestionDesigner, createDesignerStore, type DesignerStore } from '@exam/lowcode/designer';
import { api, platformToken } from '../services/api';
import { buildCandidateGroups, snapshotHash, type CandidateGroup } from '../services/agent-preview';

interface Detail { id: number; name: string; currentVersion: number; publishedVersion: number; formJson: QuestionJson; }
interface ChatMessage { role: 'user' | 'assistant'; content: string; }
interface AgentPlanView { steps: string[]; targets: Array<{ id: string; type: string; label: string; path: string }>; assumptions: string[]; risk: 'low' | 'medium' | 'high'; acceptanceCriteria: string[]; validation?: 'checking' | 'passed' | 'repairing'; warningCount?: number; }


function describePatchOp(op: QuestionPatch['ops'][number], targets: AgentPlanView['targets']): string {
  const id = 'targetId' in op ? op.targetId : op.parentId;
  const target = targets.find((item) => item.id === id);
  const label = target?.label ?? '计划范围内组件';
  if (op.op === 'insertChild') return `新增 ${op.node.type} 到「${label}」`;
  if (op.op === 'updateOptions') return `修改「${label}」的配置`;
  if (op.op === 'remove') return `删除「${label}」`;
  return `移动「${label}」`;
}


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
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [pendingPatch, setPendingPatch] = useState<QuestionPatch | null>(null);
  const [candidateStore, setCandidateStore] = useState<DesignerStore | null>(null);
  const [candidateGroups, setCandidateGroups] = useState<CandidateGroup[]>([]);
  const [candidateBaseJson, setCandidateBaseJson] = useState<QuestionJson | null>(null);
  const [candidateBase, setCandidateBase] = useState<{ hash: string } | null>(null);
  const [agentPlan, setAgentPlan] = useState<AgentPlanView | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [leftPanel, setLeftPanel] = useState<'components' | 'agent'>('components');
  const abortRef = useRef<AbortController | null>(null);
  const planTargetsRef = useRef<AgentPlanView['targets']>([]);
  const storeRef = useRef<DesignerStore | null>(null);
  useEffect(() => { void api<Detail>(`/api/question-types/${id}`).then((value) => { storeRef.current = createDesignerStore(value.formJson); setDetail(value); }); }, [id]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (!candidateBase) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [candidateBase]);
  useEffect(() => {
    if (!candidateBaseJson || !pendingPatch) { setCandidateStore(null); return; }
    try {
      const next = createDesignerStore(candidateBaseJson);
      if (selectedCandidateOps.length) next.applyPatch({ summary: pendingPatch.summary, ops: selectedCandidateOps });
      setCandidateStore(next);
      setAgentError(null);
    } catch {
      setCandidateStore(null);
      setAgentError('所选改动之间存在依赖，无法单独预览；请恢复全部改动或拒绝本次候选。');
    }
  }, [candidateBaseJson, candidateGroups, pendingPatch]);
  useEffect(() => {
    if (!publishError) return;
    const timer = window.setTimeout(() => setPublishError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [publishError]);
  if (!detail || !storeRef.current) return <main className="platform-page">加载中…</main>;
  const store = storeRef.current;
  const activeStore = candidateStore ?? store;
  const selectedCandidateOps = candidateGroups.filter((group) => group.selected).flatMap((group) => group.ops);
  const save = async () => {
    if (candidateStore) { setAgentError('请先确认或拒绝当前候选改动，再保存草稿。'); return; }
    const saved = await api<{ version: number }>(`/api/question-types/${id}/versions`, { method: 'POST', body: JSON.stringify({ formJson: store.getJson() }) });
    setDetail({ ...detail, currentVersion: saved.version }); setMessage(`已保存 v${saved.version}`);
  };
  const publish = async () => {
    setPublishError(null);
    try { await api(`/api/question-types/${id}/publish`, { method: 'POST', body: JSON.stringify({ version: detail.currentVersion }) }); setDetail({ ...detail, publishedVersion: detail.currentVersion }); setMessage('发布成功'); }
    catch (error) { setMessage(''); setPublishError(`发布失败：${errorMessage(error)}`); }
  };
  const cancelChat = () => { abortRef.current?.abort(); abortRef.current = null; setChatBusy(false); };
  const sendChat = async () => {
    if (!chatInput.trim() || chatBusy) return;
    const text = chatInput.trim();
    const baseSnapshotHash = snapshotHash(store.getJson());
    setChatInput(''); setChatBusy(true); setPendingPatch(null); setCandidateStore(null); setCandidateGroups([]); setCandidateBaseJson(null); setCandidateBase(null); setAgentPlan(null); planTargetsRef.current = []; setAgentError(null); setChatLog((items) => [...items, { role: 'user', content: text }]);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await fetch('/api/agent/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${platformToken}` }, body: JSON.stringify({ sessionId: `design-${id}`, message: text, contractVersion: CONTRACT_VERSION, questionOutline: outlineForAgent(store.getJson()), baseSnapshotHash }), signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(await response.text());
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true });
        const frames = buffer.split('\n\n'); buffer = frames.pop() ?? '';
        for (const frame of frames) {
          if (frame.startsWith(':')) continue;
          const event = frame.match(/^event:\s*(\w+)\ndata:\s*(.+)$/s); if (!event) continue;
          const data = JSON.parse(event[2]) as Record<string, unknown>;
          if (event[1] === 'plan') {
            planTargetsRef.current = Array.isArray(data.targets) ? data.targets as AgentPlanView['targets'] : [];
            setAgentPlan({
              steps: Array.isArray(data.steps) ? data.steps.map(String) : [],
              targets: planTargetsRef.current,
              assumptions: Array.isArray(data.assumptions) ? data.assumptions.map(String) : [],
              risk: data.risk === 'high' || data.risk === 'medium' ? data.risk : 'low',
              acceptanceCriteria: Array.isArray(data.acceptanceCriteria) ? data.acceptanceCriteria.map(String) : [],
            });
          } else if (event[1] === 'validation') {
            setAgentPlan((current) => current ? { ...current, validation: data.valid === true ? 'passed' : 'repairing', warningCount: Array.isArray(data.warnings) ? data.warnings.length : 0 } : current);
          } else if (event[1] === 'message') {
            const delta = String(data.delta ?? '');
            setChatLog((items) => {
              const last = items.at(-1);
              if (last?.role === 'assistant') return [...items.slice(0, -1), { ...last, content: last.content + delta }];
              return [...items, { role: 'assistant', content: delta }];
            });
          } else if (event[1] === 'patch') {
            const patch = { summary: String(data.summary ?? ''), ops: (data.ops ?? []) as QuestionPatch['ops'] };
            try {
              if (snapshotHash(store.getJson()) !== baseSnapshotHash) {
                setAgentError('生成期间画布已发生变化，本次建议基于旧版本，未应用候选改动。请重新生成。');
                continue;
              }
              const groups = buildCandidateGroups(patch, planTargetsRef.current);
              setCandidateBaseJson(store.getJson());
              setCandidateGroups(groups);
              setCandidateBase({ hash: baseSnapshotHash });
              setPendingPatch(patch);
            } catch (error) {
              console.error('Failed to preview agent patch', error);
              setAgentError('改动预览失败，画布未发生变化。');
            }
          }
          else if (event[1] === 'error') setAgentError(data.code === 'CLARIFICATION_REQUIRED' ? String(data.message ?? '请补充目标组件信息。') : data.code === 'REPAIR_LIMIT_EXCEEDED' ? '改动未通过校验，系统已停止重试，画布没有应用本次结果。请缩小修改范围后重试。' : data.code === 'PATCH_SCOPE_VIOLATION' ? '候选改动超出了计划范围，已拦截且未应用。请重新描述目标组件。' : '未能生成可应用的改动，请调整描述后重试。');
        }
      }
    } catch (error) { if ((error as Error).name !== 'AbortError') setAgentError('AI 助手暂时不可用，请稍后重试。'); }
    finally { abortRef.current = null; setChatBusy(false); }
  };
  const confirmPending = () => {
    if (!pendingPatch || !candidateStore || !candidateBase || candidateGroups.every((group) => !group.selected)) return;
    if (snapshotHash(store.getJson()) !== candidateBase.hash) {
      setAgentError('画布在确认前已发生变化，候选改动已丢弃，请重新生成。');
      setPendingPatch(null); setCandidateStore(null); setCandidateGroups([]); setCandidateBaseJson(null); setCandidateBase(null);
      return;
    }
    store.setJson(candidateStore.getJson());
    setChatLog((items) => [...items, { role: 'assistant', content: `已确认：${pendingPatch.summary}` }]);
    setPendingPatch(null);
    setCandidateStore(null);
    setCandidateGroups([]);
    setCandidateBaseJson(null);
    setCandidateBase(null);
    setAgentError(null);
  };
  const rejectPending = () => {
    if (!pendingPatch) return;
    setChatLog((items) => [...items, { role: 'assistant', content: `已拒绝候选改动：${pendingPatch.summary}` }]);
    setPendingPatch(null);
    setCandidateStore(null);
    setCandidateGroups([]);
    setCandidateBaseJson(null);
    setCandidateBase(null);
    setAgentError(null);
  };
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
          <button className="button-secondary" type="button" onClick={() => void save()} disabled={Boolean(pendingPatch)}>保存草稿</button>
          <button className="button-primary" type="button" onClick={() => void publish()} disabled={Boolean(pendingPatch) || Boolean(candidateStore)}>发布当前版本</button>
        </div>
      </header>
      {detail.formJson.contractVersion !== CONTRACT_VERSION ? <div className="version-banner">该题型基于契约 v{detail.formJson.contractVersion}，当前设计器为 v{CONTRACT_VERSION}</div> : null}
      <section className={`design-workspace${leftPanel === 'agent' ? ' is-agent-mode' : ''}${pendingPatch ? ' is-patch-preview' : ''}`}>
        <QuestionDesigner store={activeStore} />
        <div className="design-left-tabs" role="tablist" aria-label="左侧面板">
          <button type="button" role="tab" aria-selected={leftPanel === 'components'} className={leftPanel === 'components' ? 'is-active' : ''} onClick={() => setLeftPanel('components')} disabled={Boolean(pendingPatch)}>组件列表</button>
          <button type="button" role="tab" aria-selected={leftPanel === 'agent'} className={leftPanel === 'agent' ? 'is-active' : ''} onClick={() => setLeftPanel('agent')}>AI 助手{pendingPatch ? <span className="notification-dot" /> : null}</button>
        </div>
        <div className="design-settings-title">组件设置</div>
        <aside className="agent-chat-drawer" aria-label="AI 助手">
          <div className="agent-chat-header">
            <div className="agent-avatar">✦</div>
            <div><h2>AI 题型助手</h2><p>描述你的需求，我来调整画布</p></div>
          </div>
          <div className={`agent-chat-log${chatLog.length === 0 ? ' is-empty' : ''}`}>
            {chatLog.length === 0 ? <div className="agent-empty-state"><span>✦</span><strong>从一句话开始设计</strong><p>试试“创建一道关于光合作用的单选题，包含 4 个选项”</p></div> : chatLog.map((item, index) => <div className={item.role === 'user' ? 'chat-message is-user' : 'chat-message'} key={`${index}-${item.role}-${item.content}`}>{item.content}</div>)}
          </div>
          {agentPlan ? <div className={`agent-plan-preview risk-${agentPlan.risk}`}><strong>执行计划</strong>{agentPlan.targets.length ? <p>目标：{agentPlan.targets.map((target) => `${target.label}（${target.path}）`).join('、')}</p> : null}{agentPlan.steps.map((step, index) => <p key={index}>{index + 1}. {step}</p>)}{agentPlan.assumptions.map((assumption, index) => <p key={`assumption-${index}`}>假设：{assumption}</p>)}{agentPlan.acceptanceCriteria.map((criterion, index) => <p key={`criterion-${index}`}>验收：{criterion}</p>)}<small>风险：{agentPlan.risk === 'high' ? '高' : agentPlan.risk === 'medium' ? '中' : '低'}{agentPlan.validation ? ` · ${agentPlan.validation === 'passed' ? `校验通过${agentPlan.warningCount ? `，${agentPlan.warningCount} 条提示` : ''}` : agentPlan.validation === 'repairing' ? '正在校验/修复' : '待校验'}` : ''}</small></div> : null}
          {pendingPatch ? <div className="agent-patch-preview"><strong>候选改动预览</strong><p>{pendingPatch.summary}</p><p className="agent-confirm-note">确认勾选的改动后保留在当前草稿；仍需点击页面顶部“保存”才生成新版本。画布预览只展示勾选的候选组。</p><fieldset className="agent-change-groups"><legend>按改动组确认</legend><small>已选 {candidateGroups.filter((group) => group.selected).length}/{candidateGroups.length} 组</small>{candidateGroups.map((group) => <label key={group.id}><input type="checkbox" checked={group.selected} onChange={(event) => setCandidateGroups((items) => items.map((item) => item.id === group.id ? { ...item, selected: event.target.checked } : item))} /><span>{group.label}</span>{group.risk === 'high' ? <em>高风险</em> : null}</label>)}</fieldset><ol>{selectedCandidateOps.map((op, index) => <li key={index}>{describePatchOp(op, agentPlan?.targets ?? [])}</li>)}</ol><div><button className="button-primary" type="button" onClick={confirmPending} disabled={!candidateGroups.some((group) => group.selected) || !candidateStore}>确认所选改动</button><button className="button-ghost" type="button" onClick={rejectPending}>拒绝全部</button></div></div> : null}
          {agentError ? <div className="agent-error" role="alert">{agentError}</div> : null}
          <div className="agent-composer">
            <textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendChat(); } }} placeholder={pendingPatch ? '请先确认或拒绝当前改动' : '描述你想创建或修改的题型…'} disabled={chatBusy || Boolean(pendingPatch)} />
            <div className="agent-composer-footer"><span>Enter 发送 · Shift+Enter 换行</span><button className="agent-send" type="button" aria-label={chatBusy ? '取消生成' : '发送'} onClick={() => chatBusy ? cancelChat() : void sendChat()} disabled={Boolean(pendingPatch) || (!chatBusy && !chatInput.trim())}>{chatBusy ? '停止' : '↑'}</button></div>
          </div>
        </aside>
      </section>
    </div>
  );
}
