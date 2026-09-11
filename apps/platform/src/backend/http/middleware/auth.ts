import type { FastifyInstance } from 'fastify';

export function registerAuth(app: FastifyInstance, token: string): void {
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/exam/')) return;
    if (request.headers.authorization !== `Bearer ${token}`) {
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
  });
}
