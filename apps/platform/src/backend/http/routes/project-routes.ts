import type { FastifyInstance } from 'fastify';
import type { PlatformAccessStore } from '../../domain/platform-access-store';
import type { QuestionTypeStore } from '../../domain/question-type-store';
import { requireRole, requireUser } from '../middleware/auth';
import { PlatformError } from '../../domain/question-type-store';

export function registerProjectRoutes(app: FastifyInstance, access: PlatformAccessStore, questions: QuestionTypeStore): void {
  app.get('/api/projects', async (request) => access.listProjectsForUserAsync(requireUser(request)));

  app.post<{ Body: { name?: string; description?: string; questionTypeIds?: number[]; answerUserIds?: number[] } }>('/api/admin/projects', async (request, reply) => {
    const user = requireRole(request, 'admin');
    if (!request.body?.name?.trim()) throw new PlatformError(400, 'PROJECT_NAME_REQUIRED');
    return reply.code(201).send(await access.createProjectAsync({ ...request.body, name: request.body.name, createdBy: user.id }));
  });

  app.get('/api/admin/projects', async (_request) => access.listProjectsForUserAsync(requireRole(_request, 'admin')));
  app.get('/api/admin/users', async (request) => { requireRole(request, 'admin'); return access.listUsers(); });

  app.get<{ Params: { id: string } }>('/api/admin/projects/:id', async (request) => {
    requireRole(request, 'admin');
    const project = await access.getProjectAsync(Number(request.params.id));
    if (!project) throw new PlatformError(404, 'PROJECT_NOT_FOUND');
    return { ...project, members: await access.listMembersAsync(project.id), questionIds: await access.listQuestionIdsForProjectAsync(project.id) };
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (request) => {
    const user = requireUser(request);
    const id = Number(request.params.id);
    if (!await access.hasProjectPermissionAsync(user, id, 'answer')) throw new PlatformError(403, 'FORBIDDEN');
    const project = await access.getProjectAsync(id);
    if (!project) throw new PlatformError(404, 'PROJECT_NOT_FOUND');
    return project;
  });

  app.get<{ Params: { id: string } }>('/api/admin/projects/:id/members', async (request) => {
    const id = Number(request.params.id);
    requireRole(request, 'admin');
    if (!await access.getProjectAsync(id)) throw new PlatformError(404, 'PROJECT_NOT_FOUND');
    return access.listMembersAsync(id);
  });

  app.post<{ Params: { id: string }; Body: { userId?: number; permission?: 'manage' | 'answer' } }>('/api/admin/projects/:id/members', async (request, reply) => {
    requireRole(request, 'admin');
    const projectId = Number(request.params.id);
    if (!await access.getProjectAsync(projectId)) throw new PlatformError(404, 'PROJECT_NOT_FOUND');
    if (!request.body?.userId || !request.body.permission || !await access.getUserAsync(request.body.userId)) throw new PlatformError(400, 'INVALID_MEMBER');
    await access.setMemberAsync(projectId, request.body.userId, request.body.permission);
    return reply.code(201).send({ assigned: true });
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id/questions', async (request) => {
    const user = requireUser(request);
    const projectId = Number(request.params.id);
    if (!await access.hasProjectPermissionAsync(user, projectId, 'answer')) throw new PlatformError(403, 'FORBIDDEN');
    if (!await access.getProjectAsync(projectId)) throw new PlatformError(404, 'PROJECT_NOT_FOUND');
    const items = await Promise.all((await access.listQuestionIdsForProjectAsync(projectId)).map((id) => questions.getByIdAsync(id)));
    return items.flatMap((item) => item && item.publishedVersion > 0 ? [{ id: item.id, code: item.code, name: item.name, subject: item.subject, publishedVersion: item.publishedVersion }] : []);
  });

  app.get<{ Params: { projectId: string; questionId: string } }>('/api/projects/:projectId/questions/:questionId', async (request) => {
    const user = requireUser(request);
    const projectId = Number(request.params.projectId); const questionId = Number(request.params.questionId);
    if (!await access.hasProjectPermissionAsync(user, projectId, 'answer')) throw new PlatformError(403, 'FORBIDDEN');
    if (!await access.getProjectAsync(projectId) || !(await access.getQuestionProjectIdsAsync(questionId)).includes(projectId)) throw new PlatformError(404, 'QUESTION_NOT_FOUND');
    const record = await questions.getByIdAsync(questionId); const published = record && await questions.getPublishedAsync(record);
    if (!published) throw new PlatformError(404, 'QUESTION_NOT_FOUND');
    return { ...published, id: record.id, code: record.code, name: record.name };
  });

  app.post<{ Params: { projectId: string; questionId: string }; Body: { version?: number; answerData?: unknown } }>('/api/projects/:projectId/questions/:questionId/answers', async (request, reply) => {
    const user = requireUser(request);
    const projectId = Number(request.params.projectId); const questionId = Number(request.params.questionId);
    if (!await access.hasProjectPermissionAsync(user, projectId, 'answer')) throw new PlatformError(403, 'FORBIDDEN');
    if (!(await access.getQuestionProjectIdsAsync(questionId)).includes(projectId)) throw new PlatformError(404, 'QUESTION_NOT_FOUND');
    const record = await questions.getByIdAsync(questionId); const published = record && await questions.getPublishedAsync(record);
    if (!record || !published) throw new PlatformError(404, 'QUESTION_NOT_FOUND');
    const version = request.body?.version ?? published.version;
    await questions.recordAnswerAsync(record, version, request.body?.answerData ?? {}, { userId: user.id, projectId });
    return reply.code(201).send({ accepted: true, version, userId: user.id, projectId });
  });
}
