import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';

import { api } from '../services/api';

interface QuestionTypeItem {
  id: number; code: string; name: string; subject: string; status: number;
  currentVersion: number; publishedVersion: number;
}

export interface CurrentUser { id?: number; displayName: string; role: 'admin' | 'user'; }

type StatusFilter = 'all' | 'draft' | 'published';

export function QuestionTypesPage({ user, onLogout }: { user?: CurrentUser; onLogout?: () => void }) {
  const [items, setItems] = useState<QuestionTypeItem[]>([]);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const load = () => api<QuestionTypeItem[]>('/api/question-types').then(setItems);
  useEffect(() => { void load(); }, []);

  const drafts = items.filter((item) => item.currentVersion > item.publishedVersion).length;
  const published = items.filter((item) => item.publishedVersion > 0).length;
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !normalizedQuery || `${item.name} ${item.code} ${item.subject}`.toLowerCase().includes(normalizedQuery);
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'draft' && item.currentVersion > item.publishedVersion)
        || (statusFilter === 'published' && item.publishedVersion > 0);
      return matchesQuery && matchesStatus;
    });
  }, [items, query, statusFilter]);

  const createQuestionType = (event: React.FormEvent) => {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    const query = name.trim() ? `?name=${encodeURIComponent(name.trim())}` : '';
    navigate(`/admin/question-types/new${query}`);
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar"><Link className="sidebar-brand" to="/admin/question-types" aria-label="Exam Studio 首页"><span className="design-brand-mark">E</span><span><strong>Exam Studio</strong><small>智能题型编排平台</small></span></Link><nav className="sidebar-nav" aria-label="管理导航"><NavLink className="is-active" to="/admin/question-types">题型管理</NavLink><NavLink to="/admin/projects">项目管理</NavLink></nav><div className="sidebar-bottom"><div className="sidebar-user"><span className="catalog-user-avatar">{user?.displayName?.charAt(0) || '管'}</span><span>{user?.displayName || '管理员'}</span></div><button type="button" onClick={onLogout}>退出登录</button></div></aside>
      <main className="app-main"><div className="catalog-content">
        <section className="catalog-hero">
          <div>
            <span className="catalog-kicker">QUESTION TYPE LIBRARY</span>
            <h1>题型管理</h1>
            <p>创建、设计并发布可复用的智能题型。</p>
          </div>
          <form className="catalog-create" onSubmit={createQuestionType}>
            <label htmlFor="question-type-name">新建题型</label>
            <div>
              <input id="question-type-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="输入题型名称（点击创建进入向导）" />
              <button type="submit" disabled={creating}>{creating ? '打开中…' : <><span>＋</span> 创建题型</>}</button>
            </div>
          </form>
        </section>

        <section className="catalog-stats" aria-label="题型概览">
          <article><span className="stat-icon is-blue">▦</span><div><strong>{items.length}</strong><small>全部题型</small></div><em>总量</em></article>
          <article><span className="stat-icon is-amber">◇</span><div><strong>{drafts}</strong><small>待发布草稿</small></div><em>待处理</em></article>
          <article><span className="stat-icon is-green">✓</span><div><strong>{published}</strong><small>已发布题型</small></div><em>可用</em></article>
        </section>

        <section className="catalog-panel">
          <header className="catalog-panel-header">
            <div><h2>题型库</h2><p>共 {items.length} 个题型，当前显示 {filteredItems.length} 个</p></div>
            <div className="catalog-filters">
              <label className="catalog-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、编码或学科" aria-label="搜索题型" /></label>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} aria-label="按状态筛选">
                <option value="all">全部状态</option>
                <option value="draft">待发布</option>
                <option value="published">已发布</option>
              </select>
            </div>
          </header>

          {filteredItems.length > 0 ? (
            <div className="catalog-table-wrap">
              <table className="catalog-table">
                <thead><tr><th>题型名称</th><th>学科</th><th>版本进度</th><th>状态</th><th><span className="sr-only">操作</span></th></tr></thead>
                <tbody>{filteredItems.map((item) => {
                  const isDraft = item.currentVersion > item.publishedVersion;
                  return <tr key={item.id}>
                    <td><div className="catalog-name-cell"><span>{item.name.trim().charAt(0) || '题'}</span><div><strong>{item.name}</strong><small>{item.code || `TYPE-${String(item.id).padStart(4, '0')}`}</small></div></div></td>
                    <td><span className="subject-chip">{item.subject || '通用'}</span></td>
                    <td><div className="version-cell"><strong>v{item.currentVersion}</strong><span>已发布 v{item.publishedVersion}</span></div></td>
                    <td><span className={`catalog-state${isDraft ? ' is-draft' : ' is-published'}`}><i />{isDraft ? '待发布' : '已同步'}</span></td>
                    <td><div className="catalog-row-actions"><Link className="catalog-preview-link" to={`/admin/question-types/${item.id}/preview`}>预览</Link><Link className="catalog-design-link" to={`/admin/question-types/${item.id}/edit`}>编辑 <span>→</span></Link></div></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          ) : (
            <div className="catalog-empty"><span>⌕</span><strong>没有找到匹配的题型</strong><p>尝试更换搜索词或筛选条件。</p><button type="button" onClick={() => { setQuery(''); setStatusFilter('all'); }}>清除筛选</button></div>
          )}
        </section>
      </div></main>
    </div>
  );
}
