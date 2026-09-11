import type { FastifyInstance } from 'fastify';

import { PlatformError, type QuestionTypeStore } from '../../domain/question-type-store';

function requireRecord(store: QuestionTypeStore, id: string) {
  const record = store.getById(Number(id));
  if (!record) throw new PlatformError(404, 'QUESTION_TYPE_NOT_FOUND');
  return record;
}

export function registerQuestionTypeRoutes(app: FastifyInstance, store: QuestionTypeStore): void {
  app.post<{ Body: { name: string; description?: string; subject?: string } }>('/api/question-types', async (request, reply) => {
    const record = store.create(request.body ?? { name: '' });
    return reply.code(201).send({ id: record.id, code: record.code, currentVersion: 1, publishedVersion: 0 });
  });

  app.get('/api/question-types', async () => store.list().map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    description: item.description,
    subject: item.subject,
    status: item.status,
    currentVersion: item.currentVersion,
    publishedVersion: item.publishedVersion,
  })));

  app.get<{ Params: { id: string } }>('/api/question-types/:id', async (request) => {
    const record = requireRecord(store, request.params.id);
    return { ...record, versions: undefined, formJson: record.versions.get(record.currentVersion)?.formJson };
  });

  app.post<{ Params: { id: string }; Body: { formJson?: unknown; json?: unknown; source?: 0 | 1 | 2 } }>('/api/question-types/:id/versions', async (request, reply) => {
    const record = requireRecord(store, request.params.id);
    const body = request.body ?? {};
    return reply.code(201).send(store.saveVersion(record, body.formJson ?? body.json, body.source ?? 0));
  });

  app.post<{ Params: { id: string }; Body: { version: number } }>('/api/question-types/:id/publish', async (request) => {
    const snapshot = store.publish(requireRecord(store, request.params.id), request.body.version);
    return { publishedVersion: snapshot.version };
  });

  app.get<{ Params: { id: string } }>('/api/question-types/:id/versions', async (request) => {
    const record = requireRecord(store, request.params.id);
    return [...record.versions.values()].map(({ version, contractVersion, libVersion, source }) => ({ version, contractVersion, libVersion, source }));
  });

  app.get<{ Params: { id: string; v: string } }>('/api/question-types/:id/versions/:v', async (request) => {
    const snapshot = requireRecord(store, request.params.id).versions.get(Number(request.params.v));
    if (!snapshot) throw new PlatformError(404, 'VERSION_NOT_FOUND');
    return snapshot;
  });

  app.put<{ Params: { id: string }; Body: { name?: string; description?: string; subject?: string } }>('/api/question-types/:id', async (request) => {
    const record = requireRecord(store, request.params.id);
    if (request.body?.name !== undefined) record.name = request.body.name;
    if (request.body?.description !== undefined) record.description = request.body.description;
    if (request.body?.subject !== undefined) record.subject = request.body.subject;
    return { id: record.id, name: record.name, description: record.description, subject: record.subject };
  });

  app.delete<{ Params: { id: string } }>('/api/question-types/:id', async (request) => {
    const record = requireRecord(store, request.params.id);
    record.status = 2;
    record.publishedVersion = 0;
    return { archived: true };
  });
}
