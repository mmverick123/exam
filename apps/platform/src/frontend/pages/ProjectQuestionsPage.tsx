import React, { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { api } from '../services/api';
import type { CurrentUser } from './QuestionTypesPage';

interface Question { id: number; code: string; name: string; subject: string; }
export function ProjectQuestionsPage({ projectId, user, onLogout }: { projectId: string; user?: CurrentUser; onLogout?: () => void }) {
  const [items, setItems] = useState<Question[]>([]);
  useEffect(() => { void api<Question[]>(`/api/projects/${projectId}/questions`).then(setItems); }, [projectId]);
  return <div className="app-shell"><aside className="app-sidebar"><Link className="sidebar-brand" to="/projects"><span className="design-brand-mark">E</span><span><strong>Exam Studio</strong><small>在线考试平台</small></span></Link><nav className="sidebar-nav" aria-label="考试导航"><NavLink className="is-active" to="/projects">考试列表</NavLink></nav><div className="sidebar-bottom"><div className="sidebar-user"><span className="catalog-user-avatar">{user?.displayName?.charAt(0) || '用'}</span><span>{user?.displayName || '用户'}</span></div><button type="button" onClick={onLogout}>退出登录</button></div></aside><main className="app-main"><div className="catalog-content"><Link to="/projects">← 返回考试列表</Link><h1>项目题目</h1><table><thead><tr><th>题目</th><th>学科</th><th>操作</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.name}<small>{item.code}</small></td><td>{item.subject || '通用'}</td><td><Link className="button-primary" to={`/projects/${projectId}/questions/${item.id}/answer`}>答题</Link></td></tr>)}</tbody></table></div></main></div>;
}
