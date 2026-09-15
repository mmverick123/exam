import type { FastifyInstance } from 'fastify';
import type { PlatformAccessStore } from '../../domain/platform-access-store';
import { PlatformError } from '../../domain/question-type-store';
import { requireUser } from '../middleware/auth';

export function registerAuthRoutes(app: FastifyInstance, access: PlatformAccessStore): void {
  app.post<{ Body: { username?: string; password?: string } }>('/api/auth/login', async (request, reply) => {
    const body = request.body ?? {};
    const user = await access.authenticateAsync(body.username ?? '', body.password ?? '');
    if (!user) throw new PlatformError(401, 'INVALID_CREDENTIALS');
    const session = await access.createSessionAsync(user);
    reply.header('Set-Cookie', `exam_session=${session}; HttpOnly; Path=/; SameSite=Lax`);
    return { user };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.headers.cookie?.split(';').map((item) => item.trim()).find((item) => item.startsWith('exam_session='))?.slice('exam_session='.length);
    await access.deleteSessionAsync(token);
    reply.header('Set-Cookie', 'exam_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
    return { loggedOut: true };
  });

  app.get('/api/auth/me', async (request) => ({ user: requireUser(request) }));
}
