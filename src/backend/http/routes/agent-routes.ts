import type { FastifyInstance } from 'fastify';

export interface AgentProxyOptions { agentUrl: string; agentToken: string; fetchImpl: typeof fetch; }

export function registerAgentRoutes(app: FastifyInstance, options: AgentProxyOptions): void {
  app.post<{ Body: Record<string, unknown> }>('/api/agent/chat', async (request, reply) => {
    const controller = new AbortController();
    request.raw.on('aborted', () => controller.abort());
    reply.raw.on('close', () => { if (!reply.raw.writableEnded) controller.abort(); });
    let upstream: Response;
    try {
      upstream = await options.fetchImpl(`${options.agentUrl}/agent/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-agent-token': options.agentToken },
        body: JSON.stringify(request.body ?? {}),
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      return reply.code(502).send({ error: 'AGENT_UNAVAILABLE' });
    }
    reply.raw.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    });
    if (!upstream.body) { reply.raw.end(); return; }
    try {
      for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
        if (controller.signal.aborted) break;
        reply.raw.write(Buffer.from(chunk));
      }
    } finally { reply.raw.end(); }
  });
}
