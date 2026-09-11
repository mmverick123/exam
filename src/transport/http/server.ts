import Fastify, { type FastifyInstance } from 'fastify';

import { UnsupportedContractVersionError } from '../../contracts/bundles';
import { defaultProvider, type AgentProvider } from '../../providers';
import { getSession, recordSession } from '../../session/session-store';
import { runAgent, type AgentRequest } from '../../application/state-machine';

const SERVICE_TOKEN = process.env.AGENT_SERVICE_TOKEN ?? 'agent-dev-token';

function writeSse(reply: { raw: { write: (chunk: string) => boolean } }, event: string, data: Record<string, unknown>): void {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function buildAgentServer(providerFactory: () => AgentProvider = defaultProvider): FastifyInstance {
  const app = Fastify({ bodyLimit: 256 * 1024 });
  app.post<{ Body: AgentRequest }>('/agent/chat', async (request, reply) => {
    if (request.headers['x-agent-token'] !== SERVICE_TOKEN) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const body = request.body;
    if (!body?.message || !body?.contractVersion || !body?.questionOutline) return reply.code(400).send({ error: 'INVALID_REQUEST' });
    const controller = new AbortController();
    request.raw.on('aborted', () => controller.abort());
    reply.raw.on('close', () => { if (!reply.raw.writableEnded) controller.abort(); });
    controller.signal.addEventListener('abort', () => request.log.info({ sessionId: body.sessionId }, 'agent model invocation aborted'), { once: true });
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const heartbeat = setInterval(() => { if (!ended) reply.raw.write(': ping\n\n'); }, 15_000);
    let ended = false;
    try {
      const session = body.sessionId ? getSession(body.sessionId) : undefined;
      if (session && session.requestCount >= 30 && Date.now() - session.windowStartedAt < 60_000) {
        writeSse(reply, 'error', { code: 'RATE_LIMITED', message: '会话请求过于频繁' });
        reply.raw.end(); return;
      }
      const estimatedInputTokens = Math.ceil((body.message.length + JSON.stringify(body.questionOutline).length) / 4);
      if (estimatedInputTokens > 64_000 || (session?.estimatedTokens ?? 0) + estimatedInputTokens > 100_000) {
        writeSse(reply, 'error', { code: 'TOKEN_LIMIT_EXCEEDED', message: '请求或会话 token 预算已达上限' });
        reply.raw.end(); return;
      }
      if (session) { session.requestCount += 1; session.estimatedTokens += estimatedInputTokens; }
      const result = await runAgent({ ...body, history: session?.turns, signal: controller.signal, onEvent: (event) => { if (!ended) writeSse(reply, event.event, event.data); } }, providerFactory());
      if (body.sessionId) recordSession(body.sessionId, result.events, body.message, result.patch);
      reply.raw.end();
      ended = true;
    } catch (error) {
      if (!ended && error instanceof UnsupportedContractVersionError) writeSse(reply, 'error', { code: error.code, message: error.message });
      else if (!ended && (error as Error).name !== 'AbortError') writeSse(reply, 'error', { code: 'AGENT_FAILED', message: String((error as Error).message ?? error) });
      reply.raw.end();
      ended = true;
    } finally {
      clearInterval(heartbeat);
    }
  });
  return app;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  await buildAgentServer().listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
}
