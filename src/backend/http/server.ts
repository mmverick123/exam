import Fastify, { type FastifyInstance } from 'fastify';

import {
  AGENT_SERVICE_TOKEN,
  AGENT_SERVICE_URL,
  PLATFORM_TOKEN,
  type PlatformServerOptions,
} from '../config/runtime';
import { QuestionTypeStore } from '../domain/question-type-store';
import { registerAuth } from './middleware/auth';
import { registerErrorHandler } from './middleware/errors';
import { registerAgentRoutes } from './routes/agent-routes';
import { registerExamRoutes } from './routes/exam-routes';
import { registerQuestionTypeRoutes } from './routes/question-type-routes';

export type { PlatformServerOptions } from '../config/runtime';

export function buildServer(
  store = new QuestionTypeStore(),
  options: PlatformServerOptions = {},
): FastifyInstance {
  const app = Fastify({ bodyLimit: 256 * 1024 });
  registerAuth(app, PLATFORM_TOKEN);
  registerErrorHandler(app);
  registerAgentRoutes(app, {
    agentUrl: options.agentUrl ?? AGENT_SERVICE_URL,
    agentToken: options.agentToken ?? AGENT_SERVICE_TOKEN,
    fetchImpl: options.fetchImpl ?? fetch,
  });
  registerQuestionTypeRoutes(app, store);
  registerExamRoutes(app, store);
  return app;
}
