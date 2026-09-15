import type { FastifyInstance } from 'fastify';

import { PlatformError, type QuestionTypeStore } from '../../domain/question-type-store';
import type { PlatformAccessStore } from '../../domain/platform-access-store';
import { requireRole } from '../middleware/auth';

async function requireRecord(store: QuestionTypeStore, id: string) {
  const record = await store.getByIdAsync(Number(id));
  if (!record) throw new PlatformError(404, 'QUESTION_TYPE_NOT_FOUND');
  return record;
}

export function registerQuestionTypeRoutes(app: FastifyInstance, store: QuestionTypeStore, access?: PlatformAccessStore): void {
  app.post<{ Body: { name: string; description?: string; subject?: string } }>('/api/question-types', async (request, reply) => {
    if (access) requireRole(request, 'admin');
    const record = await store.createAsync(request.body ?? { name: '' });
    return reply.code(201).send({ id: record.id, code: record.code, currentVersion: 1, publishedVersion: 0 });
  });

  app.get('/api/question-types', async (request) => { if (access) requireRole(request, 'admin'); return (await store.listAsync()).filter((item) => item.status !== 2).map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    description: item.description,
    subject: item.subject,
    status: item.status,
    currentVersion: item.currentVersion,
    publishedVersion: item.publishedVersion,
  })); });

  app.post<{ Body: { name?: string; description?: string; subject?: string; formJson?: unknown } }>('/api/admin/question-types', async (request, reply) => {
    if (!access) throw new PlatformError(500, 'ACCESS_STORE_NOT_CONFIGURED');
    const user = requireRole(request, 'admin');
    const body = request.body ?? {};
    if (!body.name?.trim() || !body.formJson) throw new PlatformError(400, 'QUESTION_TYPE_FIELDS_REQUIRED');
    const record = await store.createAsync({ name: body.name, description: body.description, subject: body.subject });
    try {
      // Replace the initial empty version with the submitted Step 1 configuration.
      await store.saveVersionAsync(record, body.formJson, 0);
      return reply.code(201).send({ id: record.id, code: record.code, currentVersion: record.currentVersion, createdBy: user.id });
    } catch (error) {
      // The in-memory adapter cannot transact; archive the partially-created record so it is not exposed.
      record.status = 2;
      throw error;
    }
  });

  app.put<{ Params: { id: string }; Body: { projectIds?: number[] } }>('/api/admin/question-types/:id/permissions', async (request) => {
    if (!access) throw new PlatformError(500, 'ACCESS_STORE_NOT_CONFIGURED');
    requireRole(request, 'admin');
    const record = await requireRecord(store, request.params.id);
    const requested = request.body?.projectIds ?? [];
    for (const projectId of requested) if (!await access.getProjectAsync(projectId)) throw new PlatformError(404, 'PROJECT_NOT_FOUND');
    for (const current of await access.getQuestionProjectIdsAsync(record.id)) if (!requested.includes(current)) await access.unassignQuestionAsync(current, record.id);
    for (const projectId of requested) await access.assignQuestionAsync(projectId, record.id);
    return { projectIds: await access.getQuestionProjectIdsAsync(record.id) };
  });

  app.get<{ Params: { id: string } }>('/api/question-types/:id', async (request) => {
    if (access) requireRole(request, 'admin');
    const record = await requireRecord(store, request.params.id);
    return { ...record, versions: undefined, formJson: record.versions.get(record.currentVersion)?.formJson };
  });

  app.post<{ Params: { id: string }; Body: { formJson?: unknown; json?: unknown; source?: 0 | 1 | 2 } }>('/api/question-types/:id/versions', async (request, reply) => {
    if (access) requireRole(request, 'admin');
    const record = await requireRecord(store, request.params.id);
    const body = request.body ?? {};
    return reply.code(201).send(await store.saveVersionAsync(record, body.formJson ?? body.json, body.source ?? 0));
  });

  app.post<{ Params: { id: string }; Body: { version: number } }>('/api/question-types/:id/publish', async (request) => {
    if (access) requireRole(request, 'admin');
    const snapshot = await store.publishAsync(await requireRecord(store, request.params.id), request.body.version);
    return { publishedVersion: snapshot.version };
  });

  app.get<{ Params: { id: string } }>('/api/question-types/:id/versions', async (request) => {
    if (access) requireRole(request, 'admin');
    const record = await requireRecord(store, request.params.id);
    return [...record.versions.values()].map(({ version, contractVersion, libVersion, source }) => ({ version, contractVersion, libVersion, source }));
  });

  app.get<{ Params: { id: string; v: string } }>('/api/question-types/:id/versions/:v', async (request) => {
    if (access) requireRole(request, 'admin');
    const record = await requireRecord(store, request.params.id); const snapshot = record.versions.get(Number(request.params.v));
    if (!snapshot) throw new PlatformError(404, 'VERSION_NOT_FOUND');
    return snapshot;
  });

  app.put<{ Params: { id: string }; Body: { name?: string; description?: string; subject?: string } }>('/api/question-types/:id', async (request) => {
    if (access) requireRole(request, 'admin');
    const record = await requireRecord(store, request.params.id);
    if (request.body?.name !== undefined) record.name = request.body.name;
    if (request.body?.description !== undefined) record.description = request.body.description;
    if (request.body?.subject !== undefined) record.subject = request.body.subject;
    return { id: record.id, name: record.name, description: record.description, subject: record.subject };
  });

  app.delete<{ Params: { id: string } }>('/api/question-types/:id', async (request) => {
    if (access) requireRole(request, 'admin');
    const record = await requireRecord(store, request.params.id);
    record.status = 2;
    record.publishedVersion = 0;
    return { archived: true };
  });
}
