import React, { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { api } from '../services/api';
import type { CurrentUser } from './QuestionTypesPage';

interface Project { id: number; name: string; description: string; code: string; }

export function ProjectsPage({ user, onLogout }: { user?: CurrentUser; onLogout?: () => void } = {}) {
  const [items, setItems] = useState<Project[]>([]);
  useEffect(() => { void api<Project[]>('/api/projects').then(setItems); }, []);
  return <div className="app-shell"><aside className="app-sidebar"><Link className="sidebar-brand" to="/projects"><span className="design-brand-mark">E</span><span><strong>Exam Studio</strong><small>在线考试平台</small></span></Link><nav className="sidebar-nav" aria-label="考试导航"><NavLink className="is-active" to="/projects">考试列表</NavLink></nav><div className="sidebar-bottom"><div className="sidebar-user"><span className="catalog-user-avatar">{user?.displayName?.charAt(0) || '用'}</span><span>{user?.displayName || '用户'}</span></div><button type="button" onClick={onLogout}>退出登录</button></div></aside><main className="app-main"><div className="catalog-content"><header className="content-header"><div><span className="catalog-kicker">EXAM LIST</span><h1>考试列表</h1><p>选择考试项目开始答题。</p></div></header><div className="project-grid">{items.map((item) => <Link className="project-card" to={`/projects/${item.id}/questions`} key={item.id}><strong>{item.name}</strong><small>{item.code}</small><p>{item.description || '暂无描述'}</p></Link>)}</div></div></main></div>;
}
