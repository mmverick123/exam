import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'mysql2/promise';

export type UserRole = 'admin' | 'user';
export type ProjectPermission = 'manage' | 'answer';

export interface UserRecord {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  passwordHash: string;
  status: 'active' | 'disabled';
}

export interface ProjectRecord {
  id: number;
  code: string;
  name: string;
  description: string;
  createdBy: number;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

interface ProjectMemberRecord {
  projectId: number;
  userId: number;
  permission: ProjectPermission;
}

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
}

function hashPassword(password: string): string {
  const salt = randomUUID().replaceAll('-', '');
  const derived = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, hash: string): boolean {
  const [salt, expected] = hash.split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 32);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return expectedBuffer.length === actual.length && timingSafeEqual(actual, expectedBuffer);
}

export class PlatformAccessStore {
  private nextUserId = 3;
  private nextProjectId = 1;
  private readonly users = new Map<number, UserRecord>();
  private readonly usersByName = new Map<string, UserRecord>();
  private readonly projects = new Map<number, ProjectRecord>();
  private readonly members: ProjectMemberRecord[] = [];
  private readonly questionProjects = new Map<number, Set<number>>();
  private readonly sessions = new Map<string, SessionUser>();

  constructor(private readonly pool?: Pool) {
    if (!pool) {
      this.addSeedUser(1, process.env.EXAM_ADMIN_USERNAME ?? 'admin', process.env.EXAM_ADMIN_PASSWORD ?? 'admin123', '管理员', 'admin');
      this.addSeedUser(2, process.env.EXAM_USER_USERNAME ?? 'user', process.env.EXAM_USER_PASSWORD ?? 'user123', '答题用户', 'user');
      const demo = this.createProject({ name: '演示项目', description: '默认答题项目', createdBy: 1 });
      this.setMember(demo.id, 2, 'answer');
    }
  }

  async hydrate(): Promise<void> { if (!this.pool) return; const [users] = await this.pool.query<any[]>('SELECT * FROM users WHERE status=\'active\''); for (const row of users) { const user: UserRecord = { id: Number(row.id), username: row.username, displayName: row.display_name, role: row.role, passwordHash: row.password_hash, status: row.status }; this.users.set(user.id, user); this.usersByName.set(user.username, user); } }

  private addSeedUser(id: number, username: string, password: string, displayName: string, role: UserRole): void {
    const user = { id, username, displayName, passwordHash: hashPassword(password), role, status: 'active' as const };
    this.users.set(id, user);
    this.usersByName.set(username, user);
  }

  authenticate(username: string, password: string): SessionUser | undefined {
    const user = this.usersByName.get(username);
    if (!user || user.status !== 'active' || !verifyPassword(password, user.passwordHash)) return undefined;
    return this.toSessionUser(user);
  }

  async authenticateAsync(username: string, password: string): Promise<SessionUser | undefined> {
    if (!this.pool) return this.authenticate(username, password);
    const [rows] = await this.pool.execute<any[]>('SELECT * FROM users WHERE username=? AND status=\'active\' LIMIT 1', [username]);
    const row = rows[0];
    return row && verifyPassword(password, row.password_hash) ? { id: Number(row.id), username: row.username, displayName: row.display_name, role: row.role } : undefined;
  }

  async createSessionAsync(user: SessionUser): Promise<string> {
    if (!this.pool) return this.createSession(user);
    const token = randomUUID(); const now = new Date(); const expires = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    await this.pool.execute('INSERT INTO user_sessions (token,user_id,expires_at,created_at) VALUES (?,?,?,?)', [token, user.id, expires, now]);
    return token;
  }

  createSession(user: SessionUser): string {
    const token = randomUUID();
    this.sessions.set(token, user);
    return token;
  }

  getSession(token: string | undefined): SessionUser | undefined {
    return token ? this.sessions.get(token) : undefined;
  }

  async getSessionAsync(token: string | undefined): Promise<SessionUser | undefined> {
    if (!this.pool) return this.getSession(token);
    if (!token) return undefined;
    const [rows] = await this.pool.execute<any[]>('SELECT u.id,u.username,u.display_name,u.role FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>UTC_TIMESTAMP() AND u.status=\'active\' LIMIT 1', [token]);
    const row = rows[0]; return row ? { id: Number(row.id), username: row.username, displayName: row.display_name, role: row.role } : undefined;
  }

  deleteSession(token: string | undefined): void {
    if (token) this.sessions.delete(token);
  }

  async deleteSessionAsync(token: string | undefined): Promise<void> { if (!this.pool) return this.deleteSession(token); if (token) await this.pool.execute('DELETE FROM user_sessions WHERE token=?', [token]); }

  getUser(id: number): SessionUser | undefined {
    const user = this.users.get(id);
    return user && user.status === 'active' ? this.toSessionUser(user) : undefined;
  }

  async getUserAsync(id: number): Promise<SessionUser | undefined> { if (!this.pool) return this.getUser(id); const [rows] = await this.pool.execute<any[]>('SELECT id,username,display_name,role FROM users WHERE id=? AND status=\'active\'', [id]); const row = rows[0]; return row ? { id: Number(row.id), username: row.username, displayName: row.display_name, role: row.role } : undefined; }

  listUsers(): SessionUser[] {
    return [...this.users.values()].filter((user) => user.status === 'active').map((user) => this.toSessionUser(user));
  }

  createProject(input: { name: string; description?: string; createdBy: number }): ProjectRecord {
    const now = new Date().toISOString();
    const id = this.nextProjectId++;
    const project: ProjectRecord = {
      id,
      code: `PRJ-${String(id).padStart(4, '0')}`,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      createdBy: input.createdBy,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(id, project);
    this.setMember(id, input.createdBy, 'manage');
    return project;
  }

  async createProjectAsync(input: { name: string; description?: string; createdBy: number; questionTypeIds?: number[]; answerUserIds?: number[] }): Promise<ProjectRecord> { if (!this.pool) { const project = this.createProject(input); for (const questionId of input.questionTypeIds ?? []) this.assignQuestion(project.id, questionId); for (const userId of input.answerUserIds ?? []) this.setMember(project.id, userId, 'answer'); return project; } const connection = await this.pool.getConnection(); try { await connection.beginTransaction(); const code = `PRJ-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`; const now = new Date(); const [result] = await connection.execute<any>('INSERT INTO projects (code,name,description,created_by,status,created_at,updated_at) VALUES (?,?,?,? ,\'active\',?,?)', [code, input.name.trim(), input.description?.trim() ?? '', input.createdBy, now, now]); const id = Number(result.insertId); await connection.execute('INSERT INTO project_members (project_id,user_id,permission,created_at) VALUES (?,?,\'manage\',?)', [id, input.createdBy, now]); for (const questionId of input.questionTypeIds ?? []) await connection.execute('INSERT IGNORE INTO project_question_types (project_id,question_type_id,assigned_by,assigned_at) VALUES (?,?,?,?)', [id, questionId, input.createdBy, now]); for (const userId of input.answerUserIds ?? []) await connection.execute('INSERT INTO project_members (project_id,user_id,permission,created_at) VALUES (?,?,\'answer\',?) ON DUPLICATE KEY UPDATE permission=\'answer\'', [id, userId, now]); await connection.commit(); return { id, code, name: input.name.trim(), description: input.description?.trim() ?? '', createdBy: input.createdBy, status: 'active', createdAt: now.toISOString(), updatedAt: now.toISOString() }; } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); } }

  getProject(id: number): ProjectRecord | undefined { return this.projects.get(id); }
  async getProjectAsync(id: number): Promise<ProjectRecord | undefined> { if (!this.pool) return this.getProject(id); const [rows] = await this.pool.execute<any[]>('SELECT * FROM projects WHERE id=?', [id]); return this.mapProject(rows[0]); }

  listProjectsForUser(user: SessionUser): ProjectRecord[] {
    if (user.role === 'admin') return [...this.projects.values()].filter((project) => project.status === 'active');
    const ids = new Set(this.members.filter((member) => member.userId === user.id).map((member) => member.projectId));
    return [...this.projects.values()].filter((project) => project.status === 'active' && ids.has(project.id));
  }
  async listProjectsForUserAsync(user: SessionUser): Promise<ProjectRecord[]> { if (!this.pool) return this.listProjectsForUser(user); const [rows] = user.role === 'admin' ? await this.pool.query<any[]>('SELECT * FROM projects WHERE status=\'active\' ORDER BY updated_at DESC') : await this.pool.execute<any[]>('SELECT p.* FROM projects p JOIN project_members m ON m.project_id=p.id WHERE p.status=\'active\' AND m.user_id=? ORDER BY p.updated_at DESC', [user.id]); return rows.map((row) => this.mapProject(row)).filter(Boolean) as ProjectRecord[]; }

  listProjects(): ProjectRecord[] { return [...this.projects.values()]; }

  setMember(projectId: number, userId: number, permission: ProjectPermission): void {
    const existing = this.members.find((member) => member.projectId === projectId && member.userId === userId);
    if (existing) existing.permission = permission;
    else this.members.push({ projectId, userId, permission });
  }
  async setMemberAsync(projectId: number, userId: number, permission: ProjectPermission): Promise<void> { if (!this.pool) return this.setMember(projectId, userId, permission); await this.pool.execute('INSERT INTO project_members (project_id,user_id,permission,created_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE permission=VALUES(permission)', [projectId, userId, permission, new Date()]); }

  removeMember(projectId: number, userId: number): void {
    const index = this.members.findIndex((member) => member.projectId === projectId && member.userId === userId);
    if (index >= 0) this.members.splice(index, 1);
  }

  listMembers(projectId: number): Array<SessionUser & { permission: ProjectPermission }> {
    return this.members.filter((member) => member.projectId === projectId).flatMap((member) => {
      const user = this.getUser(member.userId);
      return user ? [{ ...user, permission: member.permission }] : [];
    });
  }
  async listMembersAsync(projectId: number): Promise<Array<SessionUser & { permission: ProjectPermission }>> { if (!this.pool) return this.listMembers(projectId); const [rows] = await this.pool.execute<any[]>('SELECT u.id,u.username,u.display_name,u.role,m.permission FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? AND u.status=\'active\' ORDER BY u.display_name', [projectId]); return rows.map((row) => ({ id: Number(row.id), username: row.username, displayName: row.display_name, role: row.role, permission: row.permission })); }

  hasProjectPermission(user: SessionUser, projectId: number, permission: ProjectPermission): boolean {
    if (user.role === 'admin') return true;
    const member = this.members.find((item) => item.projectId === projectId && item.userId === user.id);
    return member?.permission === permission || (permission === 'answer' && member?.permission === 'manage');
  }
  async hasProjectPermissionAsync(user: SessionUser, projectId: number, permission: ProjectPermission): Promise<boolean> { if (!this.pool) return this.hasProjectPermission(user, projectId, permission); if (user.role === 'admin') return true; const [rows] = await this.pool.execute<any[]>('SELECT permission FROM project_members WHERE project_id=? AND user_id=? LIMIT 1', [projectId, user.id]); const value = rows[0]?.permission; return value === permission || (permission === 'answer' && value === 'manage'); }

  assignQuestion(projectId: number, questionTypeId: number): void {
    const set = this.questionProjects.get(questionTypeId) ?? new Set<number>();
    set.add(projectId);
    this.questionProjects.set(questionTypeId, set);
  }
  async assignQuestionAsync(projectId: number, questionTypeId: number, assignedBy = 1): Promise<void> { if (!this.pool) return this.assignQuestion(projectId, questionTypeId); await this.pool.execute('INSERT IGNORE INTO project_question_types (project_id,question_type_id,assigned_by,assigned_at) VALUES (?,?,?,?)', [projectId, questionTypeId, assignedBy, new Date()]); }

  unassignQuestion(projectId: number, questionTypeId: number): void {
    this.questionProjects.get(questionTypeId)?.delete(projectId);
  }
  async unassignQuestionAsync(projectId: number, questionTypeId: number): Promise<void> { if (!this.pool) return this.unassignQuestion(projectId, questionTypeId); await this.pool.execute('DELETE FROM project_question_types WHERE project_id=? AND question_type_id=?', [projectId, questionTypeId]); }

  getQuestionProjectIds(questionTypeId: number): number[] {
    return [...(this.questionProjects.get(questionTypeId) ?? [])];
  }
  async getQuestionProjectIdsAsync(questionTypeId: number): Promise<number[]> { if (!this.pool) return this.getQuestionProjectIds(questionTypeId); const [rows] = await this.pool.execute<any[]>('SELECT project_id FROM project_question_types WHERE question_type_id=?', [questionTypeId]); return rows.map((row) => Number(row.project_id)); }

  isQuestionVisibleToUser(questionTypeId: number, user: SessionUser): boolean {
    return this.getQuestionProjectIds(questionTypeId).some((projectId) => this.hasProjectPermission(user, projectId, 'answer'));
  }

  listQuestionIdsForProject(projectId: number): number[] {
    return [...this.questionProjects.entries()].filter(([, projects]) => projects.has(projectId)).map(([questionId]) => questionId);
  }
  async listQuestionIdsForProjectAsync(projectId: number): Promise<number[]> { if (!this.pool) return this.listQuestionIdsForProject(projectId); const [rows] = await this.pool.execute<any[]>('SELECT question_type_id FROM project_question_types WHERE project_id=?', [projectId]); return rows.map((row) => Number(row.question_type_id)); }

  private mapProject(row: any): ProjectRecord | undefined { return row ? { id: Number(row.id), code: row.code, name: row.name, description: row.description, createdBy: Number(row.created_by), status: row.status, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() } : undefined; }

  private toSessionUser(user: UserRecord): SessionUser {
    return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
  }
}
