import React, { useState } from 'react';
import { api } from '../services/api';

export function LoginPage({ onLogin }: { onLogin: (user: { role: 'admin' | 'user'; displayName: string }) => void }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    try { const result = await api<{ user: { role: 'admin' | 'user'; displayName: string } }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }); onLogin(result.user); }
    catch (err) { setError(String(err)); }
  };
  return <main className="platform-page"><div className="auth-card"><div className="design-brand-mark">E</div><h1>登录 Exam Studio</h1><p>进入题型编排与在线答题平台</p><form onSubmit={(event) => void submit(event)}><label>账号<input value={username} onChange={(event) => setUsername(event.target.value)} /></label><label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error ? <div role="alert" className="auth-error">{error}</div> : null}<button className="button-primary" type="submit">登录</button></form></div></main>;
}
