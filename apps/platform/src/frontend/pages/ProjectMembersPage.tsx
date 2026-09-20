import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';

import { api } from '../services/api';
import type { CurrentUser } from './QuestionTypesPage';

type Permission = 'manage' | 'answer';

interface User {
  id: number;
  displayName: string;
  username: string;
  role: 'admin' | 'user';
}

interface Member extends User {
  permission: Permission;
}

interface Project {
  id: number;
  name: string;
  description: string;
  code: string;
  members: Member[];
}

export function ProjectMembersPage({ user, onLogout }: { user?: CurrentUser; onLogout?: () => void }) {
  const { id } = useParams();
  const projectId = Number(id);
  const [project, setProject] = useState<Project | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingPermission, setEditingPermission] = useState<Permission>('answer');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [nextProject, nextUsers] = await Promise.all([
        api<Project>(`/api/admin/projects/${projectId}`),
        api<User[]>('/api/admin/users'),
      ]);
      setProject(nextProject);
      setUsers(nextUsers);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [projectId]);

  const membersById = useMemo(() => new Map((project?.members ?? []).map((member) => [member.id, member])), [project]);
  const canManage = user?.role === 'admin' || Boolean(user?.id && project?.members.some((member) => member.id === user.id && member.permission === 'manage'));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredUsers = users.filter((item) => {
    if (!normalizedQuery) return true;
    return [item.displayName, item.username, item.role === 'admin' ? '管理员' : '普通用户']
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  });

  const addAnswerPermission = async (userId: number) => {
    setSavingId(userId);
    setError('');
    try {
      await api(`/api/admin/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify({ userId, permission: 'answer' }) });
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingId(null);
    }
  };

  const startEdit = (member: Member) => {
    setEditingId(member.id);
    setEditingPermission(member.permission);
    setError('');
  };

  const updatePermission = async (userId: number) => {
    setSavingId(userId);
    setError('');
    try {
      await api(`/api/admin/projects/${projectId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ permission: editingPermission }) });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingId(null);
    }
  };

  const removePermission = async (member: Member) => {
    if (!window.confirm(`确定删除 ${member.displayName} 的项目权限吗？`)) return;
    setSavingId(member.id);
    setError('');
    try {
      await api(`/api/admin/projects/${projectId}/members/${member.id}`, { method: 'DELETE' });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingId(null);
    }
  };

  return <div className="app-shell">
    <aside className="app-sidebar">
      <Link className="sidebar-brand" to="/admin/question-types"><span className="design-brand-mark">E</span><span><strong>Exam Studio</strong><small>智能题型编排平台</small></span></Link>
      <nav className="sidebar-nav" aria-label="管理导航"><NavLink to="/admin/question-types">题型管理</NavLink><NavLink className="is-active" to="/admin/projects">项目管理</NavLink></nav>
      <div className="sidebar-bottom"><div className="sidebar-user"><span className="catalog-user-avatar">{user?.displayName?.charAt(0) || '管'}</span><span>{user?.displayName || '管理员'}</span></div><button type="button" onClick={onLogout}>退出登录</button></div>
    </aside>
    <main className="app-main"><div className="catalog-content">
      <Link className="project-members-back" to="/admin/projects">← 返回项目管理</Link>
      <header className="project-members-hero"><div><span className="catalog-kicker">PROJECT ANSWER ACCESS</span><h1>{project?.name || '项目答题权限'}</h1><p>{project ? `${project.code} · ${project.description || '为项目配置可答题用户'}` : '加载项目成员与答题权限'}</p></div><div className="project-members-summary"><strong>{project?.members.length ?? 0}</strong><span>已配置成员</span></div></header>
      {error ? <p className="page-error" role="alert">{error}</p> : null}
      <section className="catalog-panel project-members-panel"><header className="catalog-panel-header"><div><h2>答题权限管理</h2><p>可搜索所有管理员和普通用户，并为其添加、编辑或删除当前项目权限。</p></div><label className="catalog-search project-members-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、用户名或角色" aria-label="搜索用户" /></label></header>{loading ? <div className="catalog-empty"><strong>加载中…</strong></div> : filteredUsers.length ? <div className="catalog-table-wrap"><table className="catalog-table project-members-table"><thead><tr><th>用户</th><th>角色</th><th>当前权限</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{filteredUsers.map((item) => { const member = membersById.get(item.id); const isSaving = savingId === item.id; const isEditing = editingId === item.id; return <tr key={item.id}><td><div className="catalog-name-cell"><span>{item.displayName.trim().charAt(0) || '用'}</span><div><strong>{item.displayName}</strong><small>{item.username}</small></div></div></td><td><span className={`project-role-chip${item.role === 'admin' ? ' is-admin' : ''}`}>{item.role === 'admin' ? '管理员' : '普通用户'}</span></td><td>{isEditing ? <select className="project-permission-select" value={editingPermission} onChange={(event) => setEditingPermission(event.target.value as Permission)} aria-label={`${item.displayName}权限`}><option value="answer">答题</option><option value="manage">项目管理</option></select> : member ? <div className="project-permission-list">{member.permission === 'manage' ? <span className="project-permission-chip is-manage">项目管理</span> : null}<span className="project-permission-chip">答题</span></div> : <span className="project-permission-chip is-none">未授权</span>}</td><td><div className="catalog-row-actions">{canManage ? member ? isEditing ? <><button type="button" className="catalog-design-link project-members-action" disabled={isSaving} onClick={() => void updatePermission(item.id)}>{isSaving ? '保存中…' : '保存'}</button><button type="button" className="project-members-secondary-action" disabled={isSaving} onClick={() => setEditingId(null)}>取消</button></> : <><button type="button" className="catalog-design-link project-members-action" onClick={() => startEdit(member)}>编辑权限</button><button type="button" className="project-members-danger-action" disabled={isSaving} onClick={() => void removePermission(member)}>删除权限</button></> : <button type="button" className="catalog-design-link project-members-action" disabled={isSaving} onClick={() => void addAnswerPermission(item.id)}>{isSaving ? '添加中…' : '添加答题权限'}</button> : <span className="project-members-status">无项目管理权限</span>}</div></td></tr>; })}</tbody></table></div> : <div className="catalog-empty"><span>⌕</span><strong>没有匹配的用户</strong><p>请尝试搜索姓名、用户名或角色。</p></div>}</section>
    </div></main>
  </div>;
}
