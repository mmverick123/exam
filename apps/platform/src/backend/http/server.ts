import Fastify, { type FastifyInstance } from 'fastify';

import {
  AGENT_SERVICE_TOKEN,
  AGENT_SERVICE_URL,
  PLATFORM_TOKEN,
  type PlatformServerOptions,
} from '../config/runtime';
import { QuestionTypeStore } from '../domain/question-type-store';
import { PlatformAccessStore } from '../domain/platform-access-store';
import { registerAuth } from './middleware/auth';
import { registerErrorHandler } from './middleware/errors';
import { registerAgentRoutes } from './routes/agent-routes';
import { registerExamRoutes } from './routes/exam-routes';
import { registerQuestionTypeRoutes } from './routes/question-type-routes';
import { registerAuthRoutes } from './routes/auth-routes';
import { registerProjectRoutes } from './routes/project-routes';
import { createMysqlPool, ensureSchema } from '../domain/mysql';

export type { PlatformServerOptions } from '../config/runtime';

export function buildServer(
  store?: QuestionTypeStore,
  options: PlatformServerOptions = {},
): FastifyInstance {
  const app = Fastify({ bodyLimit: 256 * 1024 });
  const mysqlPool = process.env.NODE_ENV === 'test' ? undefined : createMysqlPool();
  const questionStore = store ?? new QuestionTypeStore(mysqlPool);
  if (mysqlPool) app.addHook('onReady', async () => { await ensureSchema(mysqlPool); });
  const access = new PlatformAccessStore(mysqlPool);
  if (mysqlPool) app.addHook('onReady', async () => { await access.hydrate(); });
  registerAuth(app, PLATFORM_TOKEN, access);
  registerErrorHandler(app);
  registerAuthRoutes(app, access);
  registerProjectRoutes(app, access, questionStore);
  registerAgentRoutes(app, {
    agentUrl: options.agentUrl ?? AGENT_SERVICE_URL,
    agentToken: options.agentToken ?? AGENT_SERVICE_TOKEN,
    fetchImpl: options.fetchImpl ?? fetch,
  });
  registerQuestionTypeRoutes(app, questionStore, access);
  registerExamRoutes(app, questionStore);
  if (mysqlPool) app.addHook('onClose', async () => { await mysqlPool.end(); });
  return app;
}
