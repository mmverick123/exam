import type { FastifyInstance } from 'fastify';

import { PlatformError } from '../../domain/question-type-store';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof PlatformError) {
      return reply.code(error.statusCode).send({ error: error.code, details: error.details });
    }
    if ((error as { code?: string }).code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.code(413).send({ error: 'REQUEST_TOO_LARGE' });
    }
    return reply.code(500).send({ error: 'INTERNAL_ERROR' });
  });
}
