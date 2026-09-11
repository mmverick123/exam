import { describe, expect, it } from 'vitest';

import { CONTRACT_VERSION, DEFAULT_FORM_CONFIG } from '@exam/lowcode/contract';

import { buildAgentServer } from '../src/transport/http/server';

describe('agent SSE endpoint', () => {
  it('streams plan, patch and done events and protects service access', async () => {
    const app = buildAgentServer();
    await app.ready();
    const outline = {
      contractVersion: CONTRACT_VERSION,
      widgetList: [{ type: 'page', id: 'page_root', options: {}, widgetList: [] }],
      formConfig: { ...DEFAULT_FORM_CONFIG },
    };
    const unauthorized = await app.inject({ method: 'POST', url: '/agent/chat', payload: { message: '出题', contractVersion: CONTRACT_VERSION, questionOutline: outline } });
    expect(unauthorized.statusCode).toBe(401);
    const response = await app.inject({
      method: 'POST',
      url: '/agent/chat',
      headers: { 'x-agent-token': 'agent-dev-token' },
      payload: { sessionId: 'session-1', message: '出一道关于光合作用的单选题，4 个选项', contractVersion: CONTRACT_VERSION, questionOutline: outline },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.body).toContain('event: plan');
    expect(response.body).toContain('event: patch');
    expect(response.body).toContain('event: done');
    await app.close();
  });
});
