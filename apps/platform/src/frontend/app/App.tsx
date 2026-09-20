import React, { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { DesignPage } from '../pages/DesignPage';
import { ExamPage } from '../pages/ExamPage';
import { QuestionTypesPage, type CurrentUser } from '../pages/QuestionTypesPage';
import { LoginPage } from '../pages/LoginPage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { ProjectQuestionsPage } from '../pages/ProjectQuestionsPage';
import { QuestionTypeWizardPage } from '../pages/QuestionTypeWizardPage';
import { AdminPreviewPage } from '../pages/AdminPreviewPage';
import { AdminProjectsPage } from '../pages/AdminProjectsPage';
import { ProjectMembersPage } from '../pages/ProjectMembersPage';
import { api } from '../services/api';

function RoleGate({ user, role }: { user: CurrentUser; role: 'admin' | 'user' }) {
  if (user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin/question-types' : '/projects'} replace />;
  return <Outlet />;
}

function DesignPageRoute() {
  return <DesignPage id={useParams().id ?? ''} />;
}

function PreviewPageRoute() {
  return <AdminPreviewPage id={useParams().id ?? ''} />;
}

function ProjectQuestionsRoute({ user, onLogout }: { user: CurrentUser; onLogout: () => void }) {
  return <ProjectQuestionsPage projectId={useParams().projectId ?? ''} user={user} onLogout={onLogout} />;
}

function AnswerRoute() {
  const params = useParams();
  return <ExamPage projectId={params.projectId} questionId={params.questionId} />;
}

function ExamRoute() {
  return <ExamPage code={useParams().code} />;
}

function AppRoutes({ user, onLogout }: { user: CurrentUser; onLogout: () => void }) {
  const home = user.role === 'admin' ? '/admin/question-types' : '/projects';
  return <Routes>
    <Route path="/login" element={<Navigate to={home} replace />} />
    <Route element={<RoleGate user={user} role="admin" />}>
      <Route path="/admin/question-types" element={<QuestionTypesPage user={user} onLogout={onLogout} />} />
      <Route path="/admin/question-types/new" element={<QuestionTypeWizardPage />} />
      <Route path="/admin/question-types/:id/preview" element={<PreviewPageRoute />} />
      <Route path="/admin/question-types/:id/edit" element={<DesignPageRoute />} />
      <Route path="/question-types/:id/design" element={<DesignPageRoute />} />
      <Route path="/admin/projects" element={<AdminProjectsPage user={user} onLogout={onLogout} />} />
      <Route path="/admin/projects/:id/members" element={<ProjectMembersPage user={user} onLogout={onLogout} />} />
    </Route>
    <Route element={<RoleGate user={user} role="user" />}>
      <Route path="/projects" element={<ProjectsPage user={user} onLogout={onLogout} />} />
      <Route path="/projects/:projectId/questions" element={<ProjectQuestionsRoute user={user} onLogout={onLogout} />} />
      <Route path="/projects/:projectId/questions/:questionId/answer" element={<AnswerRoute />} />
      <Route path="/exam/:code" element={<ExamRoute />} />
    </Route>
    <Route path="/" element={<Navigate to={home} replace />} />
    <Route path="*" element={<Navigate to={home} replace />} />
  </Routes>;
}

function AppContent() {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);
  const navigate = useNavigate();
  useEffect(() => { void api<{ user: CurrentUser }>('/api/auth/me').then((result) => setUser(result.user)).catch(() => setUser(null)); }, []);
  const logout = () => { void api('/api/auth/logout', { method: 'POST' }).finally(() => { setUser(null); navigate('/login', { replace: true }); }); };
  if (user === undefined) return <main className="platform-page">加载中…</main>;
  if (!user) return <LoginPage onLogin={(next) => setUser(next)} />;
  return <AppRoutes user={user} onLogout={logout} />;
}

export function App() { return <BrowserRouter><AppContent /></BrowserRouter>; }
export const AppRoot = App;
