import type { FastifyInstance } from 'fastify';
import type { PlatformAccessStore, SessionUser, UserRole } from '../../domain/platform-access-store';
import { PlatformError } from '../../domain/question-type-store';

declare module 'fastify' {
  interface FastifyRequest { user?: SessionUser; }
}

export function registerAuth(app: FastifyInstance, token: string, access: PlatformAccessStore): void {
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/api/auth/login' || request.url === '/api/auth/logout' || request.url.startsWith('/api/exam/')) return;
    const authorization = request.headers.authorization;
    if (authorization === `Bearer ${token}`) {
      request.user = await access.getUserAsync(1) ?? { id: 1, username: 'admin', displayName: '管理员', role: 'admin' };
      return;
    }
    const sessionToken = request.headers.cookie?.split(';').map((item) => item.trim()).find((item) => item.startsWith('exam_session='))?.slice('exam_session='.length);
    const user = await access.getSessionAsync(sessionToken);
    if (user) {
      request.user = user;
      return;
    }
    if (!authorization && request.url === '/api/auth/me') {
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
    if (request.url.startsWith('/api/')) {
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
  });
}

export function requireUser(request: { user?: SessionUser }): SessionUser {
  if (!request.user) throw new PlatformError(401, 'UNAUTHORIZED');
  return request.user;
}

export function requireRole(request: { user?: SessionUser }, role: UserRole): SessionUser {
  const user = requireUser(request);
  if (user.role !== role) throw new PlatformError(403, 'FORBIDDEN');
  return user;
}
