import React, { useEffect, useState } from 'react';

import { api } from '../services/api';

interface QuestionTypeItem {
  id: number; code: string; name: string; subject: string; status: number;
  currentVersion: number; publishedVersion: number;
}

export function QuestionTypesPage() {
  const [items, setItems] = useState<QuestionTypeItem[]>([]);
  const [name, setName] = useState('新的题型');
  const load = () => api<QuestionTypeItem[]>('/api/question-types').then(setItems);
  useEffect(() => { void load(); }, []);
  return (
    <main className="platform-page">
      <h1>题型管理</h1>
      <form onSubmit={(event) => { event.preventDefault(); void api('/api/question-types', { method: 'POST', body: JSON.stringify({ name }) }).then(load); }}>
        <input value={name} onChange={(event) => setName(event.target.value)} />
        <button type="submit">新建题型</button>
      </form>
      <table><thead><tr><th>名称</th><th>学科</th><th>版本</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}>
          <td>{item.name}</td><td>{item.subject || '—'}</td><td>{item.publishedVersion}/{item.currentVersion}</td>
          <td>{item.currentVersion > item.publishedVersion ? '有未发布改动' : '已同步'}</td>
          <td><a href={`/question-types/${item.id}/design`}>设计</a>{item.publishedVersion > 0 ? <> · <a href={`/exam/${item.code}`}>答题</a></> : null}</td>
        </tr>)}</tbody>
      </table>
    </main>
  );
}
