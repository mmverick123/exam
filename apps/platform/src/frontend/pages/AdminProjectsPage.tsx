import React, { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { api } from '../services/api';
import type { CurrentUser } from './QuestionTypesPage';

interface Project { id: number; name: string; description: string; code: string; }
interface QuestionType { id: number; name: string; subject: string; status: number; }
interface User { id: number; displayName: string; username: string; role: 'admin' | 'user'; }

export function AdminProjectsPage({ user, onLogout }: { user?: CurrentUser; onLogout?: () => void }) {
  const [items, setItems] = useState<Project[]>([]);
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedQuestions, setSelectedQuestions] = useState<number[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => {
    void Promise.all([api<Project[]>('/api/admin/projects'), api<QuestionType[]>('/api/question-types'), api<User[]>('/api/admin/users')])
      .then(([projects, types, members]) => { setItems(projects); setQuestionTypes(types); setUsers(members.filter((item) => item.role === 'user')); })
      .catch((err) => setError(String(err)));
  };
  useEffect(load, []);
  const openWizard = () => { setWizardOpen(true); setStep(1); setError(''); };
  const closeWizard = () => { if (!creating) { setWizardOpen(false); setName(''); setDescription(''); setSelectedQuestions([]); setSelectedUsers([]); } };
  const save = async () => {
    setCreating(true); setError('');
    try { await api('/api/admin/projects', { method: 'POST', body: JSON.stringify({ name: name.trim(), description: description.trim(), questionTypeIds: selectedQuestions, answerUserIds: selectedUsers }) }); closeWizard(); load(); }
    catch (err) { setError(String(err)); }
    finally { setCreating(false); }
  };

  return <div className="app-shell">
    <aside className="app-sidebar"><Link className="sidebar-brand" to="/admin/question-types"><span className="design-brand-mark">E</span><span><strong>Exam Studio</strong><small>智能题型编排平台</small></span></Link><nav className="sidebar-nav" aria-label="管理导航"><NavLink to="/admin/question-types">题型管理</NavLink><NavLink className="is-active" to="/admin/projects">项目管理</NavLink></nav><div className="sidebar-bottom"><div className="sidebar-user"><span className="catalog-user-avatar">{user?.displayName?.charAt(0) || '管'}</span><span>{user?.displayName || '管理员'}</span></div><button type="button" onClick={onLogout}>退出登录</button></div></aside>
    <main className="app-main"><div className="catalog-content">
      <section className="catalog-hero"><div><span className="catalog-kicker">PROJECT ACCESS CONTROL</span><h1>项目管理</h1><p>先选择项目依赖的题型，再配置成员的答题权限。</p></div><form className="catalog-create project-create" onSubmit={(event) => { event.preventDefault(); openWizard(); }}><label htmlFor="project-name-trigger">新建项目</label><div><input id="project-name-trigger" value={name} onChange={(event) => setName(event.target.value)} placeholder="输入项目名称（点击创建进入向导）" /><button type="submit"><span>＋</span> 创建项目</button></div></form></section>
      {error && !wizardOpen ? <p className="page-error" role="alert">{error}</p> : null}
      <section className="catalog-stats" aria-label="项目概览"><article><span className="stat-icon is-blue">▦</span><div><strong>{items.length}</strong><small>全部项目</small></div><em>总量</em></article><article><span className="stat-icon is-green">✓</span><div><strong>{items.length}</strong><small>运行中项目</small></div><em>正常</em></article><article><span className="stat-icon is-amber">◇</span><div><strong>{questionTypes.length}</strong><small>可用题型</small></div><em>资源</em></article></section>
      <section className="catalog-panel"><header className="catalog-panel-header"><div><h2>项目列表</h2><p>共 {items.length} 个项目</p></div></header>{items.length ? <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>项目名称</th><th>项目编码</th><th>描述</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><div className="catalog-name-cell"><span>{item.name.trim().charAt(0) || '项'}</span><div><strong>{item.name}</strong><small>{item.code}</small></div></div></td><td><code>{item.code}</code></td><td>{item.description || '暂无描述'}</td><td><div className="catalog-row-actions"><Link className="catalog-design-link" to={`/admin/projects/${item.id}/members`}>管理成员 <span>→</span></Link></div></td></tr>)}</tbody></table></div> : <div className="catalog-empty"><span>▦</span><strong>还没有项目</strong><p>创建项目后即可选择题型并配置答题权限。</p><button type="button" onClick={openWizard}>创建第一个项目</button></div>}</section>
    </div></main>
    {wizardOpen ? <div className="modal-backdrop" role="presentation"><section className="project-wizard-modal" role="dialog" aria-modal="true" aria-labelledby="project-wizard-title"><header><div><span className="catalog-kicker">NEW PROJECT</span><h2 id="project-wizard-title">创建项目</h2></div><button type="button" className="modal-close" onClick={closeWizard}>×</button></header><div className="wizard-steps"><span className={step === 1 ? 'is-active' : ''}>1 选择依赖题型</span><span className={step === 2 ? 'is-active' : ''}>2 配置答题权限</span></div>{step === 1 ? <div className="wizard-body"><label>项目名称<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：2026 秋招笔试" /></label><label>项目描述<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="描述项目用途（可选）" /></label><h3>项目依赖的题型</h3><div className="selection-list">{questionTypes.length ? questionTypes.map((item) => <label className="selection-item" key={item.id}><input type="checkbox" checked={selectedQuestions.includes(item.id)} onChange={(event) => setSelectedQuestions(event.target.checked ? [...selectedQuestions, item.id] : selectedQuestions.filter((id) => id !== item.id))} /><span><strong>{item.name}</strong><small>{item.subject || '通用'}</small></span></label>) : <p className="muted">暂无题型，请先在题型管理中创建。</p>}</div><footer><button type="button" className="button-secondary" onClick={closeWizard}>取消</button><button type="button" className="button-primary" disabled={!name.trim()} onClick={() => setStep(2)}>下一步</button></footer></div> : <div className="wizard-body"><h3>配置项目答题权限</h3><p className="muted">选择可以在该项目中答题的用户；管理员自动拥有项目管理权限。</p><div className="selection-list">{users.length ? users.map((item) => <label className="selection-item" key={item.id}><input type="checkbox" checked={selectedUsers.includes(item.id)} onChange={(event) => setSelectedUsers(event.target.checked ? [...selectedUsers, item.id] : selectedUsers.filter((id) => id !== item.id))} /><span><strong>{item.displayName}</strong><small>{item.username}</small></span><em>答题</em></label>) : <p className="muted">暂无普通用户。</p>}</div>{error ? <p className="page-error" role="alert">{error}</p> : null}<footer><button type="button" className="button-secondary" onClick={() => setStep(1)}>上一步</button><button type="button" className="button-primary" disabled={creating} onClick={() => void save()}>{creating ? '保存中…' : '保存项目'}</button></footer></div>}</section></div> : null}
  </div>;
}
