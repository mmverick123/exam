import type { FastifyInstance } from 'fastify';

import { PlatformError, type QuestionTypeStore } from '../../domain/question-type-store';

export function registerExamRoutes(app: FastifyInstance, store: QuestionTypeStore): void {
  app.get<{ Params: { code: string } }>('/api/exam/:code', async (request) => {
    const record = store.getByCode(request.params.code);
    const published = record && store.getPublished(record);
    if (!published) throw new PlatformError(404, 'EXAM_NOT_FOUND');
    return published;
  });

  app.post<{ Params: { code: string }; Body: { version: number; answerData: unknown } }>('/api/exam/:code/answers', async (request, reply) => {
    const record = store.getByCode(request.params.code);
    if (!record) throw new PlatformError(404, 'EXAM_NOT_FOUND');
    store.validateAnswers(record, request.body.version, request.body.answerData);
    return reply.code(201).send({ accepted: true, version: request.body.version });
  });
}
